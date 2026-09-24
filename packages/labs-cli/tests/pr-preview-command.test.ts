import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from 'vitest';
import {
  parsePreviewArguments,
  planPullRequestPreview,
  runPullRequestPreview,
  statefulPreviewSlugs,
} from '../src/pr-preview-command.js';

const commit = 'a'.repeat(40);

test('requires explicit pull request identity and defaults to a dry run', () => {
  expect(
    parsePreviewArguments([
      '--pull-request',
      '17',
      '--repository',
      'LasVegasForTransit/labs',
      '--base',
      'main',
      '--head',
      commit,
      '--account-id',
      'abc123',
      '--json',
    ]),
  ).toEqual({
    pullRequest: 17,
    repository: 'LasVegasForTransit/labs',
    base: 'main',
    head: commit,
    accountId: 'abc123',
    apply: false,
    json: true,
  });
  expect(() => parsePreviewArguments(['--pull-request', '17'])).toThrow(/repository/i);
  expect(() =>
    parsePreviewArguments([
      '--pull-request',
      '17',
      '--repository',
      'LasVegasForTransit/labs',
      '--base',
      'main',
      '--head',
      commit,
      '--account-id',
      'abc123',
      '--apply',
      '--dry-run',
    ]),
  ).toThrow(/apply.*dry-run/i);
});

test('plans version previews for existing Workers and temporary Workers for new labs', async () => {
  const result = await planPullRequestPreview(
    '/repo',
    {
      pullRequest: 17,
      repository: 'LasVegasForTransit/labs',
      base: 'base',
      head: commit,
      accountId: 'abc123',
      apply: false,
      json: true,
    },
    {
      deploymentPlan: () => ({
        head: commit,
        packages: ['@lasvegasfortransit/lab-map'],
        deploy: ['map', 'home'],
      }),
      deployedWorkers: () => Promise.resolve(['lvbt-labs-home']),
      statefulProjects: () => Promise.resolve([]),
    },
  );
  expect(result.targets).toEqual([
    { slug: 'map', worker: 'lvbt-labs-pr-17-map', mode: 'temporary', cleanup: true },
    { slug: 'home', worker: 'lvbt-labs-home', mode: 'version', cleanup: false },
  ]);
});

test('discovers Durable Object projects only when they declare isolated staging', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'stateful-preview-'));
  try {
    for (const slug of ['map', 'publication'])
      await mkdir(path.join(root, 'apps', slug), { recursive: true });
    await writeFile(
      path.join(root, 'apps/map/wrangler.jsonc'),
      JSON.stringify({
        durable_objects: { bindings: [{ name: 'MAP', class_name: 'MapState' }] },
      }),
    );
    await writeFile(
      path.join(root, 'apps/map/wrangler.staging.jsonc'),
      JSON.stringify({ name: 'lvbt-labs-map-staging' }),
    );
    await writeFile(path.join(root, 'apps/publication/wrangler.jsonc'), '{}');

    await expect(statefulPreviewSlugs(root, ['map', 'publication'])).resolves.toEqual(['map']);
    await rm(path.join(root, 'apps/map/wrangler.staging.jsonc'));
    await expect(statefulPreviewSlugs(root, ['map'])).rejects.toThrow(/staging/i);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('publishes only in apply mode and preserves the machine-readable plan', async () => {
  let publishes = 0;
  const dependencies = {
    deploymentPlan: () => ({
      head: commit,
      packages: ['@lasvegasfortransit/lab-home'],
      deploy: ['home'],
    }),
    deployedWorkers: () => Promise.resolve(['lvbt-labs-home']),
    statefulProjects: () => Promise.resolve([]),
    publish: () => {
      publishes += 1;
      return Promise.resolve({
        ok: true,
        results: [
          {
            target: {
              slug: 'home',
              worker: 'lvbt-labs-home',
              mode: 'version' as const,
              cleanup: false,
            },
            status: 'verified' as const,
            receipt: { version: 'version', url: 'https://preview.example/' },
          },
        ],
      });
    },
  };
  const input = {
    pullRequest: 17,
    repository: 'LasVegasForTransit/labs',
    base: 'base',
    head: commit,
    accountId: 'abc123',
    apply: false,
    json: true,
  };
  const dryRun = await runPullRequestPreview('/repo', input, dependencies);
  expect(dryRun).toMatchObject({ command: 'preview', ok: true, changed: false, mode: 'dry-run' });
  expect(publishes).toBe(0);

  const applied = await runPullRequestPreview('/repo', { ...input, apply: true }, dependencies);
  expect(applied).toMatchObject({ command: 'preview', ok: true, changed: true, mode: 'apply' });
  expect(publishes).toBe(1);
});
