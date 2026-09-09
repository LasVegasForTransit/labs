import { execFile, execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { appendFile, lstat, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { isDeepStrictEqual, promisify } from 'node:util';
import { z } from 'zod';
import { activeVersion } from '@lvbt/web-platform/cloudflare';
import { assertDeploymentCheckout, verifyReleaseResponse } from '@lvbt/web-platform/release';
import {
  parseMigrationHandoff,
  type MigrationHandoffV1,
  type MigrationPauseOperations,
  type MigrationTransferOperations,
  type MigrationVerificationOperations,
  type MigrationVerifiedHandoffV1,
} from './migration-handoff.js';

interface PauseIdentity {
  slug: string;
  repository: string;
  sourceCommit: string;
}

type GitHub = (args: string[]) => string;
type Wrangler = (args: string[]) => Promise<string>;

interface Dependencies {
  github?: GitHub;
  wrangler?: Wrangler;
  fetch?: typeof fetch;
  guard?: () => void | Promise<void>;
}

const commitSchema = z.object({ sha: z.string().regex(/^[a-f0-9]{40}$/) });
const checkRunsSchema = z.object({
  check_runs: z.array(
    z.object({
      id: z.number().optional(),
      name: z.string(),
      status: z.string(),
      conclusion: z.string().nullable().optional(),
      head_sha: z.string(),
    }),
  ),
});
const versionSchema = z.object({
  id: z.uuid(),
  annotations: z.object({ 'workers/message': z.string() }),
});
const releaseSchema = z
  .object({
    formatVersion: z.literal(1),
    slug: z.string(),
    commit: z.string().regex(/^[a-f0-9]{40}$/),
    artifactHash: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();

async function optionalStat(file: string) {
  return lstat(file).catch((error: unknown) => {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  });
}

async function readHandoff(file: string, slug: string) {
  const stat = await optionalStat(file);
  if (stat === undefined) return null;
  if (!stat.isFile() || stat.isSymbolicLink())
    throw new Error('Migration handoff must be a regular file.');
  return parseMigrationHandoff(JSON.parse(await readFile(file, 'utf8')), slug);
}

function defaultGitHub(root: string): GitHub {
  return (args) =>
    execFileSync('gh', args, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 30000,
    });
}

function defaultWrangler(root: string): Wrangler {
  return async (args) =>
    (
      await promisify(execFile)('pnpm', ['exec', 'wrangler', ...args], {
        cwd: root,
        env: { ...process.env, WRANGLER_LOG_SANITIZE: 'true' },
        maxBuffer: 16 * 1024 * 1024,
        timeout: 120000,
      })
    ).stdout;
}

function defaultGuard(root: string, identity: PauseIdentity) {
  return () => {
    const current = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
    }).trim();
    execFileSync('git', ['merge-base', '--is-ancestor', identity.sourceCommit, current], {
      cwd: root,
      stdio: 'ignore',
    });
    assertDeploymentCheckout(root, current);
  };
}

function inspectDestination(github: GitHub, identity: PauseIdentity) {
  const endpoint = `repos/${identity.repository}`;
  const commit = commitSchema.parse(
    JSON.parse(github(['api', '--hostname', 'github.com', `${endpoint}/commits/main`])),
  ).sha;
  const owner = github([
    'variable',
    'get',
    'LVBT_DEPLOYMENT_OWNER',
    '--repo',
    identity.repository,
  ]).trim();
  if (owner !== 'true' && owner !== 'false')
    throw new Error('LVBT_DEPLOYMENT_OWNER must be true or false in the destination.');
  const checks = checkRunsSchema
    .parse(
      JSON.parse(
        github(['api', '--hostname', 'github.com', `${endpoint}/commits/${commit}/check-runs`]),
      ),
    )
    .check_runs.filter((check) => check.name === 'Validate' && check.head_sha === commit)
    .sort((left, right) => (right.id ?? 0) - (left.id ?? 0));
  const latest = checks[0];
  const validate =
    latest?.status !== 'completed'
      ? 'pending'
      : latest.conclusion === 'success'
        ? 'success'
        : 'failure';
  return { commit, deploymentOwner: owner === 'true', validate } as const;
}

export function migrationPauseOperations(
  root: string,
  identity: PauseIdentity,
  dependencies: Dependencies = {},
): MigrationPauseOperations {
  const file = path.join(root, 'migrations', `${identity.slug}.json`);
  const github = dependencies.github ?? defaultGitHub(root);
  const wrangler = dependencies.wrangler ?? defaultWrangler(root);
  const guard = dependencies.guard ?? defaultGuard(root, identity);
  return {
    async read() {
      return readHandoff(file, identity.slug);
    },
    inspectDestination() {
      return Promise.resolve(inspectDestination(github, identity));
    },
    async activeVersion() {
      const version = activeVersion(
        JSON.parse(
          await wrangler(['deployments', 'list', '--json', '--name', `lvbt-labs-${identity.slug}`]),
        ),
      );
      if (version === null) throw new Error('The Labs Worker has no active version to retain.');
      return version;
    },
    guard,
    async write(record: MigrationHandoffV1) {
      await mkdir(path.dirname(file), { recursive: true });
      try {
        await writeFile(file, `${JSON.stringify(record, null, 2)}\n`, { flag: 'wx' });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'EEXIST')
          throw new Error('A migration handoff already exists for this slug.', { cause: error });
        throw error;
      }
    },
  };
}

export function migrationTransferOperations(
  root: string,
  slug: string,
  dependencies: Pick<Dependencies, 'github' | 'guard'> = {},
): MigrationTransferOperations {
  const file = path.join(root, 'migrations', `${slug}.json`);
  const journal = path.join(root, '.wrangler', 'migrations', `${slug}.jsonl`);
  const github = dependencies.github ?? defaultGitHub(root);
  const read = async () => {
    const handoff = await readHandoff(file, slug);
    if (handoff === null) throw new Error('Pause Labs deployment ownership before transfer.');
    return handoff;
  };
  const guard =
    dependencies.guard ??
    (async () => {
      const handoff = await read();
      const current = execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: root,
        encoding: 'utf8',
      }).trim();
      assertDeploymentCheckout(root, current);
      const committed = parseMigrationHandoff(
        JSON.parse(
          execFileSync('git', ['show', `HEAD:migrations/${slug}.json`], {
            cwd: root,
            encoding: 'utf8',
          }),
        ),
        slug,
      );
      if (!isDeepStrictEqual(handoff, committed))
        throw new Error('Commit the migration pause before transferring ownership.');
    });
  return {
    read,
    async inspectDestination() {
      return inspectDestination(github, await read());
    },
    guard,
    async setDestinationOwner(enabled) {
      const handoff = await read();
      github([
        'variable',
        'set',
        'LVBT_DEPLOYMENT_OWNER',
        '--body',
        String(enabled),
        '--repo',
        handoff.repository,
      ]);
    },
    async dispatch(commit) {
      const handoff = await read();
      if (commit !== handoff.destinationCommit)
        throw new Error('Refusing to dispatch an unreviewed destination commit.');
      github([
        'workflow',
        'run',
        'deploy.yml',
        '--repo',
        handoff.repository,
        '--ref',
        'main',
        '--field',
        `commit=${commit}`,
      ]);
    },
    async journal(phase, details) {
      await mkdir(path.dirname(journal), { recursive: true });
      await appendFile(journal, `${JSON.stringify({ phase, details })}\n`);
    },
  };
}

function migrationVerificationGuard(
  root: string,
  slug: string,
  read: () => Promise<MigrationHandoffV1 | null>,
) {
  return async () => {
    const handoff = await read();
    if (handoff === null) throw new Error('Pause Labs deployment ownership before verification.');
    const current = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
    }).trim();
    assertDeploymentCheckout(root, current);
    const committed = parseMigrationHandoff(
      JSON.parse(
        execFileSync('git', ['show', `HEAD:migrations/${slug}.json`], {
          cwd: root,
          encoding: 'utf8',
        }),
      ),
      slug,
    );
    if (!isDeepStrictEqual(handoff, committed))
      throw new Error('Commit the migration pause before verifying the destination.');
  };
}

async function verifyDestinationDeployment(
  slug: string,
  handoff: MigrationHandoffV1,
  wrangler: Wrangler,
  request: typeof fetch,
) {
  const worker = `lvbt-labs-${slug}`;
  const currentVersion = async () =>
    activeVersion(JSON.parse(await wrangler(['deployments', 'list', '--json', '--name', worker])));
  const version = await currentVersion();
  if (version === null) throw new Error('The destination Worker has no active version.');
  const details = versionSchema.parse(
    JSON.parse(await wrangler(['versions', 'view', version, '--json', '--name', worker])),
  );
  if (
    details.id !== version ||
    details.annotations['workers/message'] !== `Commit ${handoff.destinationCommit}`
  )
    throw new Error('The active destination version lacks migration release provenance.');
  const base = `https://labs.lasvegasfortransit.org/${slug}/`;
  const options = {
    redirect: 'manual' as const,
    cache: 'no-store' as const,
    signal: AbortSignal.timeout(15000),
  };
  const response = await request(
    `${base}lvbt-release.json?commit=${handoff.destinationCommit}`,
    options,
  );
  const marker = releaseSchema.parse(await response.clone().json());
  await verifyReleaseResponse(response, {
    formatVersion: 1,
    slug,
    commit: handoff.destinationCommit,
    artifactHash: marker.artifactHash,
  });
  const page = await request(base, { ...options, signal: AbortSignal.timeout(15000) });
  if (page.status !== 200) throw new Error(`The migrated project returned HTTP ${page.status}.`);
  if ((await currentVersion()) !== version)
    throw new Error('The active destination version changed during stable-route verification.');
  return { version, artifactHash: marker.artifactHash };
}

async function writeVerifiedHandoff(
  file: string,
  read: () => Promise<MigrationHandoffV1 | null>,
  record: MigrationVerifiedHandoffV1,
) {
  const current = await read();
  if (current?.phase !== 'labs-paused')
    throw new Error('Only a paused migration can be recorded as destination-verified.');
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(record, null, 2)}\n`, { flag: 'wx' });
    await rename(temporary, file);
  } finally {
    await rm(temporary, { force: true });
  }
}

export function migrationVerificationOperations(
  root: string,
  slug: string,
  dependencies: Dependencies = {},
): MigrationVerificationOperations {
  const file = path.join(root, 'migrations', `${slug}.json`);
  const github = dependencies.github ?? defaultGitHub(root);
  const wrangler = dependencies.wrangler ?? defaultWrangler(root);
  const request = dependencies.fetch ?? fetch;
  const read = () => readHandoff(file, slug);
  const guard = dependencies.guard ?? migrationVerificationGuard(root, slug, read);
  return {
    read,
    async inspectDestination() {
      const handoff = await read();
      if (handoff === null) throw new Error('Pause Labs deployment ownership before verification.');
      return inspectDestination(github, handoff);
    },
    async verifyDeployment(handoff) {
      return verifyDestinationDeployment(slug, handoff, wrangler, request);
    },
    guard,
    async writeVerified(record: MigrationVerifiedHandoffV1) {
      await writeVerifiedHandoff(file, read, record);
    },
  };
}
