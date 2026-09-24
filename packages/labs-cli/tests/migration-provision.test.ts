import { expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { reconcileResources } from '@lasvegasfortransit/web-platform/provision';
import {
  migrationProvisionResources,
  migrationSourceResource,
  provisionMigrationDestination,
  runMigrationProvision,
} from '../src/migration-provision.js';

test('publishes an empty destination main once without replacing other history', async () => {
  const commit = 'a'.repeat(40);
  let remote: string | null = null;
  let pushes = 0;
  const resource = migrationSourceResource(
    commit,
    () => Promise.resolve(remote),
    () => {
      pushes += 1;
      remote = commit;
      return Promise.resolve();
    },
  );

  expect((await reconcileResources([resource], false)).operations[0]?.status).toBe('planned');
  expect((await reconcileResources([resource], true)).operations[0]?.status).toBe('verified');
  expect((await reconcileResources([resource], true)).operations[0]?.status).toBe('matched');
  expect(pushes).toBe(1);

  remote = 'b'.repeat(40);
  expect((await reconcileResources([resource], true)).operations[0]?.status).toBe('blocked');
  expect(pushes).toBe(1);
});

test('plans a missing remote repository without making writes', async () => {
  const ruleset: unknown = JSON.parse(
    readFileSync(
      path.resolve(process.cwd(), '../../.lvbt/web-platform/standards/ruleset.json'),
      'utf8',
    ),
  );
  let writes = 0;
  const result = await runMigrationProvision(
    {
      repository: 'LasVegasForTransit/example',
      commit: 'a'.repeat(40),
      accountId: 'account',
      zoneId: 'zone',
    },
    ruleset,
    false,
    {
      read: () => Promise.resolve(null),
      write: () => {
        writes += 1;
        return Promise.resolve();
      },
      push: () => {
        writes += 1;
        return Promise.resolve();
      },
      writeSecret: () => {
        writes += 1;
        return Promise.resolve();
      },
    },
  );
  expect(result.ok).toBe(true);
  expect(result.changed).toBe(false);
  expect(result.operations[0]).toMatchObject({ id: 'github.repository', status: 'planned' });
  expect(result.operations.slice(1).every((operation) => operation.status === 'withheld')).toBe(
    true,
  );
  expect(writes).toBe(0);
});

test('reports a destination setup plan without transferring deployment', async () => {
  const ruleset: unknown = JSON.parse(
    readFileSync(
      path.resolve(process.cwd(), '../../.lvbt/web-platform/standards/ruleset.json'),
      'utf8',
    ),
  );
  const result = await provisionMigrationDestination(
    '/unused',
    {
      slug: 'example',
      repository: 'LasVegasForTransit/example',
      output: '/tmp/example',
      commit: 'a'.repeat(40),
      apply: false,
    },
    {
      infrastructure: { accountId: 'account', zoneId: 'zone' },
      ruleset,
      operations: {
        read: () => Promise.resolve(null),
        write: () => Promise.reject(new Error('Dry run cannot write.')),
        push: () => Promise.reject(new Error('Dry run cannot push.')),
        writeSecret: () => Promise.reject(new Error('Dry run cannot write secrets.')),
      },
    },
  );
  expect(result).toMatchObject({
    command: 'migrate',
    ok: true,
    changed: false,
    phase: 'provision-planned',
    deploymentOwner: 'labs',
  });
});

test('refuses an existing destination that can already deploy', async () => {
  const ruleset: unknown = JSON.parse(
    readFileSync(
      path.resolve(process.cwd(), '../../.lvbt/web-platform/standards/ruleset.json'),
      'utf8',
    ),
  );
  let writes = 0;
  await expect(
    runMigrationProvision(
      {
        repository: 'LasVegasForTransit/example',
        commit: 'a'.repeat(40),
        accountId: 'account',
        zoneId: 'zone',
      },
      ruleset,
      true,
      {
        read: (endpoint) =>
          Promise.resolve(
            endpoint === 'repos/LasVegasForTransit/example'
              ? {
                  full_name: 'LasVegasForTransit/example',
                  private: false,
                  archived: false,
                  default_branch: 'main',
                }
              : { variables: [{ name: 'LVBT_DEPLOYMENT_OWNER', value: 'true' }] },
          ),
        write: () => {
          writes += 1;
          return Promise.resolve();
        },
        push: () => {
          writes += 1;
          return Promise.resolve();
        },
        writeSecret: () => {
          writes += 1;
          return Promise.resolve();
        },
      },
    ),
  ).rejects.toThrow(/deployment owner/i);
  expect(writes).toBe(0);
});

test('creates destination resources once and verifies an unchanged rerun', async () => {
  const ruleset = JSON.parse(
    readFileSync(
      path.resolve(process.cwd(), '../../.lvbt/web-platform/standards/ruleset.json'),
      'utf8',
    ),
  ) as { name: string; target: string; [key: string]: unknown };
  const target = {
    repository: 'LasVegasForTransit/example',
    commit: 'a'.repeat(40),
    accountId: 'account',
    zoneId: 'zone',
  };
  let repository: Record<string, unknown> | null = null;
  let main: string | null = null;
  let rules: Record<string, unknown> | null = null;
  let environment: Record<string, unknown> | null = null;
  let branches: { name: string; type: string }[] = [];
  let secret = false;
  let pushes = 0;
  const variables = new Map<string, string>();
  const base = `repos/${target.repository}`;
  const environmentEndpoint = `${base}/environments/production`;
  const operations = {
    read: (endpoint: string): Promise<unknown> => {
      if (endpoint === base) return Promise.resolve(repository);
      if (endpoint === `${base}/commits/main`)
        return Promise.resolve(main === null ? null : { sha: main });
      if (endpoint === `${base}/rulesets`)
        return Promise.resolve(
          rules === null
            ? []
            : [{ id: 1, name: rules.name, target: rules.target, source_type: 'Repository' }],
        );
      if (endpoint === `${base}/rulesets/1`) return Promise.resolve(rules);
      if (endpoint === `${base}/actions/variables`)
        return Promise.resolve({
          variables: [...variables].map(([name, value]) => ({ name, value })),
        });
      if (endpoint === environmentEndpoint) return Promise.resolve(environment);
      if (endpoint === `${environmentEndpoint}/deployment-branch-policies`)
        return Promise.resolve({ branch_policies: branches });
      if (endpoint === `${environmentEndpoint}/secrets`)
        return Promise.resolve({ secrets: secret ? [{ name: 'CLOUDFLARE_API_TOKEN' }] : [] });
      throw new Error(`Unexpected read: ${endpoint}`);
    },
    write: (method: string, endpoint: string, body: unknown): Promise<void> => {
      if (endpoint === 'orgs/LasVegasForTransit/repos') {
        repository = {
          full_name: target.repository,
          private: false,
          archived: false,
          default_branch: 'main',
          allow_merge_commit: false,
          allow_squash_merge: false,
          allow_rebase_merge: true,
        };
      } else if (endpoint === `${base}/rulesets`) {
        rules = { ...ruleset };
      } else if (endpoint === `${base}/actions/variables`) {
        const variable = body as { name: string; value: string };
        variables.set(variable.name, variable.value);
      } else if (endpoint === environmentEndpoint) {
        environment = {
          deployment_branch_policy:
            method === 'PUT'
              ? ((body as { deployment_branch_policy?: unknown }).deployment_branch_policy ?? null)
              : null,
          can_admins_bypass: true,
          protection_rules: [],
        };
      } else if (endpoint === `${environmentEndpoint}/deployment-branch-policies`) {
        branches = [body as { name: string; type: string }];
      } else {
        throw new Error(`Unexpected write: ${endpoint}`);
      }
      return Promise.resolve();
    },
    push: () => {
      expect(variables.get('LVBT_DEPLOYMENT_OWNER')).toBe('false');
      pushes += 1;
      main = target.commit;
      return Promise.resolve();
    },
    writeSecret: () => {
      secret = true;
      return Promise.resolve();
    },
  };

  const first = await runMigrationProvision(target, ruleset, true, operations);
  expect(first.ok).toBe(true);
  expect(first.changed).toBe(true);
  expect(variables.get('LVBT_DEPLOYMENT_OWNER')).toBe('false');
  expect(pushes).toBe(1);
  const repeated = await runMigrationProvision(target, ruleset, true, operations);
  expect(repeated.ok).toBe(true);
  expect(repeated.changed).toBe(false);
  expect(pushes).toBe(1);
});

test('provisions a public destination with disabled deployment ownership', () => {
  const ruleset: unknown = JSON.parse(
    readFileSync(
      path.resolve(process.cwd(), '../../.lvbt/web-platform/standards/ruleset.json'),
      'utf8',
    ),
  );
  const groups = migrationProvisionResources(
    {
      repository: 'LasVegasForTransit/example',
      commit: 'a'.repeat(40),
      accountId: 'account',
      zoneId: 'zone',
    },
    ruleset,
    {
      read: () => Promise.resolve(null),
      write: () => Promise.resolve(),
      push: () => Promise.resolve(),
      writeSecret: () => Promise.resolve(),
    },
  );
  expect(groups.map((group) => group.map((resource) => resource.id))).toEqual([
    ['github.repository'],
    ['github.variable.LVBT_DEPLOYMENT_OWNER'],
    ['github.source'],
    [
      'github.rules',
      'github.variable.CLOUDFLARE_ACCOUNT_ID',
      'github.variable.CLOUDFLARE_ZONE_ID',
      'github.environment.production',
    ],
    ['github.production', 'github.environment-secret.CLOUDFLARE_API_TOKEN'],
  ]);
  expect(groups[1]?.[0]?.desired(null)).toEqual({
    name: 'LVBT_DEPLOYMENT_OWNER',
    value: 'false',
  });
});
