import { execFile, execFileSync } from 'node:child_process';
import { lstat, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { z } from 'zod';
import { activeVersion } from '@lvbt/web-platform/cloudflare';
import { assertDeploymentCheckout } from '@lvbt/web-platform/release';
import {
  parseMigrationHandoff,
  type MigrationHandoffV1,
  type MigrationPauseOperations,
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

async function optionalStat(file: string) {
  return lstat(file).catch((error: unknown) => {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  });
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
      const stat = await optionalStat(file);
      if (stat === undefined) return null;
      if (!stat.isFile() || stat.isSymbolicLink())
        throw new Error('Migration handoff must be a regular file.');
      return parseMigrationHandoff(JSON.parse(await readFile(file, 'utf8')), identity.slug);
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
