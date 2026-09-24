import { execFileSync } from 'node:child_process';
import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import {
  provisionEnvironmentPresence,
  provisionEnvironmentSecret,
  provisionRepository,
  provisionRepositoryRuleset,
  provisionRepositoryVariable,
  reconcileResourceGroups,
  type ProvisionResource,
} from '@lasvegasfortransit/web-platform/provision';
import { provisionEnvironment } from '@lasvegasfortransit/web-platform/github';
import { optionalGitHubRead } from './github-preview-read.js';

interface MigrationProvisionTarget {
  repository: string;
  commit: string;
  accountId: string;
  zoneId: string;
}

interface MigrationProvisionOperations {
  read(endpoint: string): Promise<unknown>;
  write(method: 'POST' | 'PATCH' | 'PUT', endpoint: string, body: unknown): Promise<void>;
  push(): Promise<void>;
  writeSecret(): Promise<void>;
}

interface MigrationProvisionInput {
  slug: string;
  repository: string;
  output: string;
  commit: string;
  apply: boolean;
}

interface MigrationProvisionDependencies {
  infrastructure?: { accountId: string; zoneId: string };
  ruleset?: unknown;
  operations?: MigrationProvisionOperations;
}

export async function migrationDestinationCommit(
  root: string,
  requestedOutput: string,
  slug: string,
  sourceCommit: string,
) {
  const sourceRoot = await realpath(root);
  const output = await realpath(path.resolve(root, requestedOutput));
  if (output === sourceRoot || output.startsWith(`${sourceRoot}${path.sep}`))
    throw new Error('Choose a standalone directory outside Labs.');
  const git = (args: string[]) =>
    execFileSync('git', args, {
      cwd: output,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 30000,
    }).trim();
  if ((await realpath(git(['rev-parse', '--show-toplevel']))) !== output)
    throw new Error('The standalone directory must be the Git repository root.');
  if (git(['branch', '--show-current']) !== 'main')
    throw new Error('Commit the standalone repository on main before provisioning.');
  let commit: string;
  try {
    commit = git(['rev-parse', 'HEAD']);
  } catch {
    throw new Error('Commit the standalone export before provisioning.');
  }
  if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error('The standalone commit is invalid.');
  if (git(['status', '--porcelain', '--untracked-files=normal']))
    throw new Error('Provisioning requires a clean committed standalone repository.');
  const provenance = await readFile(path.join(output, 'MIGRATED_FROM.md'), 'utf8');
  if (
    !provenance.includes(`Source commit: \`${sourceCommit}\`.`) ||
    !provenance.includes(`Source path: \`apps/${slug}\`.`)
  )
    throw new Error('The standalone provenance does not match the current Labs source.');
  await readFile(path.join(output, '.lvbt/web-platform.json'));
  await readFile(path.join(output, `apps/${slug}/lab.config.ts`));
  return { output, commit };
}

export function migrationSourceResource(
  commit: string,
  read: () => Promise<string | null>,
  push: () => Promise<void>,
): ProvisionResource {
  if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error('Provide a committed destination main.');
  return {
    id: 'github.source',
    read,
    desired: (current) => {
      if (current !== null && current !== commit)
        throw new Error('Destination main differs from the reviewed standalone commit.');
      return commit;
    },
    write: () => push(),
  };
}

export function migrationProvisionResources(
  target: MigrationProvisionTarget,
  ruleset: unknown,
  operations: MigrationProvisionOperations,
): ProvisionResource[][] {
  const base = `repos/${target.repository}`;
  const environment = `${base}/environments/production`;
  const read = (endpoint: string) => operations.read(endpoint);
  const write = (method: 'POST' | 'PATCH' | 'PUT', endpoint: string, body: unknown) =>
    operations.write(method, endpoint, body);
  const variable = (name: string, value: string) =>
    provisionRepositoryVariable(
      { repository: target.repository, name, value },
      read,
      (method, endpoint, body) => write(method, endpoint, body),
    );
  return [
    [
      provisionRepository(
        { repository: target.repository, branch: 'main' },
        () => read(base),
        (method, endpoint, body) => write(method, endpoint, body),
      ),
    ],
    [variable('LVBT_DEPLOYMENT_OWNER', 'false')],
    [
      migrationSourceResource(
        target.commit,
        async () => {
          const current = await read(`${base}/commits/main`);
          return current === null
            ? null
            : z.object({ sha: z.string().regex(/^[a-f0-9]{40}$/) }).parse(current).sha;
        },
        () => operations.push(),
      ),
    ],
    [
      provisionRepositoryRuleset(
        { repository: target.repository, ruleset },
        read,
        (method, endpoint, body) => write(method, endpoint, body),
      ),
      variable('CLOUDFLARE_ACCOUNT_ID', target.accountId),
      variable('CLOUDFLARE_ZONE_ID', target.zoneId),
      provisionEnvironmentPresence(
        { repository: target.repository, environment: 'production' },
        read,
        (method, endpoint, body) => write(method, endpoint, body),
      ),
    ],
    [
      provisionEnvironment(
        { repository: target.repository, environment: 'production', branch: 'main' },
        read,
        (method, endpoint, body) => write(method, endpoint, body),
      ),
      provisionEnvironmentSecret(
        { repository: target.repository, environment: 'production', name: 'CLOUDFLARE_API_TOKEN' },
        () => read(`${environment}/secrets`),
        () => operations.writeSecret(),
      ),
    ],
  ];
}

export async function runMigrationProvision(
  target: MigrationProvisionTarget,
  ruleset: unknown,
  apply: boolean,
  operations: MigrationProvisionOperations,
) {
  const existing = await operations.read(`repos/${target.repository}`);
  if (existing !== null) {
    const repository = z
      .object({
        full_name: z.string(),
        private: z.boolean(),
        archived: z.boolean(),
        default_branch: z.string(),
      })
      .parse(existing);
    if (
      repository.full_name !== target.repository ||
      repository.private ||
      repository.archived ||
      repository.default_branch !== 'main'
    )
      throw new Error('Review the existing destination repository before provisioning.');
    const variables = z
      .object({ variables: z.array(z.object({ name: z.string(), value: z.string() })) })
      .parse(await operations.read(`repos/${target.repository}/actions/variables`)).variables;
    const owner = variables.find((variable) => variable.name === 'LVBT_DEPLOYMENT_OWNER');
    if (owner !== undefined && owner.value !== 'false')
      throw new Error('The destination deployment owner must be disabled before provisioning.');
  }
  const groups = migrationProvisionResources(target, ruleset, operations);
  if (!apply && existing === null)
    return {
      ok: true,
      changed: false,
      operations: groups.flat().map((resource, index) => ({
        id: resource.id,
        status: index === 0 ? ('planned' as const) : ('withheld' as const),
      })),
    };
  return reconcileResourceGroups(groups, apply);
}

function defaultMigrationOperations(root: string, input: MigrationProvisionInput) {
  const base = `repos/${input.repository}`;
  const token = process.env.CLOUDFLARE_API_TOKEN?.trim();
  return {
    read: (endpoint: string) => optionalGitHubRead(root, endpoint),
    write: (method: 'POST' | 'PATCH' | 'PUT', endpoint: string, body: unknown) => {
      if (
        endpoint !== 'orgs/LasVegasForTransit/repos' &&
        !endpoint.startsWith(`${base}/`) &&
        endpoint !== base
      )
        throw new Error('GitHub write is outside the migration destination.');
      execFileSync(
        'gh',
        ['api', '--hostname', 'github.com', '--method', method, '--input', '-', endpoint],
        {
          cwd: root,
          input: JSON.stringify(body),
          stdio: ['pipe', 'pipe', 'pipe'],
          timeout: 30000,
        },
      );
      return Promise.resolve();
    },
    push: () => {
      execFileSync(
        'git',
        ['push', `git@github.com:${input.repository}.git`, 'HEAD:refs/heads/main'],
        {
          cwd: input.output,
          stdio: ['ignore', 'pipe', 'pipe'],
          timeout: 120000,
          env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
        },
      );
      return Promise.resolve();
    },
    writeSecret: () => {
      if (!token) throw new Error('CLOUDFLARE_API_TOKEN is required for destination provisioning.');
      execFileSync(
        'gh',
        [
          'secret',
          'set',
          'CLOUDFLARE_API_TOKEN',
          '--env',
          'production',
          '--repo',
          input.repository,
        ],
        { cwd: root, input: token, stdio: ['pipe', 'pipe', 'pipe'], timeout: 30000 },
      );
      return Promise.resolve();
    },
  } satisfies MigrationProvisionOperations;
}

async function infrastructureTarget(root: string) {
  const module: unknown = await import(
    pathToFileURL(path.join(root, '.lvbt/infrastructure.config.ts')).href
  );
  return z.object({ default: z.unknown() }).parse(module).default;
}

async function migrationRuleset(root: string): Promise<unknown> {
  const parsed: unknown = JSON.parse(
    await readFile(path.join(root, '.lvbt/web-platform/standards/ruleset.json'), 'utf8'),
  );
  return parsed;
}

export async function provisionMigrationDestination(
  root: string,
  input: MigrationProvisionInput,
  dependencies: MigrationProvisionDependencies = {},
) {
  if (!/^LasVegasForTransit\/[A-Za-z0-9][A-Za-z0-9._-]*$/.test(input.repository))
    throw new Error('Migration destinations must be public LasVegasForTransit repositories.');
  const infrastructure = dependencies.infrastructure ?? (await infrastructureTarget(root));
  const target = z
    .object({ accountId: z.string().min(1), zoneId: z.string().min(1) })
    .parse(infrastructure);
  const ruleset = dependencies.ruleset ?? (await migrationRuleset(root));
  const operations = dependencies.operations ?? defaultMigrationOperations(root, input);
  if (
    input.apply &&
    dependencies.operations === undefined &&
    !process.env.CLOUDFLARE_API_TOKEN?.trim()
  ) {
    const repository = await operations.read(`repos/${input.repository}`);
    const secrets =
      repository === null
        ? null
        : await operations.read(`repos/${input.repository}/environments/production/secrets`);
    const present =
      secrets !== null &&
      z
        .object({ secrets: z.array(z.object({ name: z.string() })) })
        .parse(secrets)
        .secrets.some((secret) => secret.name === 'CLOUDFLARE_API_TOKEN');
    if (!present)
      throw new Error('CLOUDFLARE_API_TOKEN is required before provisioning a new destination.');
  }
  const result = await runMigrationProvision(
    { repository: input.repository, commit: input.commit, ...target },
    ruleset,
    input.apply,
    operations,
  );
  return {
    command: 'migrate',
    ...result,
    phase: input.apply ? (result.ok ? 'provisioned' : 'provision-incomplete') : 'provision-planned',
    slug: input.slug,
    repository: input.repository,
    output: input.output,
    commit: input.commit,
    deploymentOwner: 'labs',
    next: 'Wait for the destination main commit to pass Validate, then pause Labs deployment ownership.',
  };
}
