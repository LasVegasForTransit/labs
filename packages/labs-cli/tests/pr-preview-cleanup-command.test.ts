import { expect, test } from 'vitest';
import {
  cloudflarePreviewCleanupOperations,
  parsePreviewCleanupArguments,
  runPreviewCleanup,
  temporaryPreviewSlugs,
} from '../src/pr-preview-cleanup-command.js';

test('parses an explicit cleanup identity and defaults to planning', () => {
  expect(
    parsePreviewCleanupArguments([
      '--pull-request',
      '17',
      '--repository',
      'LasVegasForTransit/labs',
      '--account-id',
      'abc123',
      '--zone-id',
      'def456',
      '--json',
    ]),
  ).toEqual({
    pullRequest: 17,
    repository: 'LasVegasForTransit/labs',
    accountId: 'abc123',
    zoneId: 'def456',
    apply: false,
    json: true,
  });
});

test('discovers only temporary Workers owned by the selected pull request namespace', () => {
  expect(
    temporaryPreviewSlugs(17, [
      'lvbt-labs-home',
      'lvbt-labs-pr-17-map',
      'lvbt-labs-pr-18-other',
      'lvbt-labs-pr-17-street-grid',
    ]),
  ).toEqual(['map', 'street-grid']);
  expect(() => temporaryPreviewSlugs(17, ['lvbt-labs-pr-17-Bad'])).toThrow();
});

test('plans or applies cleanup only to Workers in the pull request namespace', async () => {
  const cleaned: string[][] = [];
  const input = {
    pullRequest: 17,
    repository: 'LasVegasForTransit/labs',
    accountId: 'abc123',
    zoneId: 'def456',
    apply: false,
    json: true,
  };
  const dependencies = {
    deployedWorkers: () =>
      Promise.resolve(['lvbt-labs-home', 'lvbt-labs-pr-17-map', 'lvbt-labs-pr-18-map']),
    cleanup: (_identity: unknown, slugs: string[], _operations: unknown, apply: boolean) => {
      cleaned.push(slugs);
      return Promise.resolve({ ok: true, changed: apply, operations: [] });
    },
    operations: {
      closed: () => Promise.resolve(true),
      read: () => Promise.resolve(null),
      remove: () => Promise.resolve(),
    },
  };

  expect(await runPreviewCleanup(input, dependencies)).toMatchObject({
    command: 'preview-cleanup',
    mode: 'dry-run',
    ok: true,
    changed: false,
    slugs: ['map'],
  });
  expect(await runPreviewCleanup({ ...input, apply: true }, dependencies)).toMatchObject({
    mode: 'apply',
    changed: true,
  });
  expect(cleaned).toEqual([['map'], ['map']]);
});

test('reads ownership from the active version and deletes only the selected Worker', async () => {
  const version = '12345678-1234-4234-8234-123456789abc';
  const endpoints: string[] = [];
  const removed: string[] = [];
  const operations = cloudflarePreviewCleanupOperations(
    {
      pullRequest: 17,
      repository: 'LasVegasForTransit/labs',
      accountId: 'abc123',
      zoneId: 'def456',
    },
    {
      list: (endpoint) => {
        endpoints.push(endpoint);
        return Promise.resolve(
          endpoint.includes('/routes')
            ? [{ pattern: 'example.org/*', script: 'another-worker' }]
            : [{ id: 'lvbt-labs-pr-17-map' }],
        );
      },
      get: (endpoint) => {
        endpoints.push(endpoint);
        return Promise.resolve(
          endpoint.endsWith('/deployments')
            ? {
                deployments: [
                  {
                    created_on: '2026-09-09T00:00:00Z',
                    versions: [{ version_id: version, percentage: 100 }],
                  },
                ],
              }
            : {
                annotations: {
                  'workers/message': `LVBT preview LasVegasForTransit/labs#17 ${'a'.repeat(40)}`,
                },
              },
        );
      },
    },
    {
      pullRequest: () => Promise.resolve({ state: 'closed' }),
      remove: (endpoint) => {
        removed.push(endpoint);
        return Promise.resolve();
      },
    },
  );

  expect(await operations.closed()).toBe(true);
  expect(await operations.read('lvbt-labs-pr-17-map')).toEqual({
    repository: 'LasVegasForTransit/labs',
    pullRequest: 17,
    version,
    routes: [],
  });
  await operations.remove('lvbt-labs-pr-17-map');
  expect(endpoints).toContain('accounts/abc123/workers/scripts/lvbt-labs-pr-17-map/deployments');
  expect(removed).toEqual(['accounts/abc123/workers/scripts/lvbt-labs-pr-17-map']);
});
