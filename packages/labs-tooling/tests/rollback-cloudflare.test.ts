import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { expect, test } from 'vitest';
import home from '../../../apps/home/lab.config.js';
import { LabManifestV1Schema } from '../src/manifest.js';
import { rollbackCloudflare, rollbackTargetHash } from '../src/rollback-cloudflare.js';
import { rollbackWorker } from '../src/rollback.js';
import { rollbackInput } from '../src/rollback-input.js';

const version = '2ae50b24-3d42-48d2-a784-627b60841961';
const expectedVersion = '1c4deaba-ee53-4c3f-ba65-176ae596cad5';
const input = {
  slug: 'home',
  version,
  expectedVersion,
  commit: 'a'.repeat(40),
  reason: 'Restore catalog',
  apply: true,
};

test('requires archive provenance, not merely a static assets binding', () => {
  const metadata = (message: string) => ({ annotations: { 'workers/message': message } });
  expect(() => rollbackTargetHash(metadata(`Commit ${input.commit}`), input, true)).toThrow();
  expect(
    rollbackTargetHash(metadata(`Archive ${input.commit} ${'f'.repeat(64)}`), input, true),
  ).toBe('f'.repeat(64));
  expect(() => rollbackTargetHash(metadata(`Commit ${'b'.repeat(40)}`), input, false)).toThrow();
  expect(() => rollbackTargetHash({}, input, false)).toThrow();
});

test('parses complete machine flags and rejects ambiguous or incomplete commands', async () => {
  const flags = [
    'home',
    '--version',
    version,
    '--expected-version',
    expectedVersion,
    '--commit',
    input.commit,
    '--reason',
    input.reason,
    '--json',
  ];
  expect(await rollbackInput(flags)).toEqual({ ...input, apply: false });
  await expect(rollbackInput([...flags, '--apply', '--dry-run'])).rejects.toThrow();
  await expect(rollbackInput(['home', '--json'])).rejects.toThrow();
});

test.each([false, true])(
  'verifies provider version and stable route (wrong source: %s)',
  async (wrongCommit) => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'lvbt-rollback-'));
    try {
      let active = expectedVersion;
      let guarded = false;
      const operations = rollbackCloudflare(root, LabManifestV1Schema.parse(home), {
        guard() {
          guarded = true;
        },
        run(args) {
          if (args[0] === 'deployments')
            return Promise.resolve(
              JSON.stringify([
                {
                  created_on: '2026-09-05T00:00:00Z',
                  versions: [{ version_id: active, percentage: 100 }],
                },
              ]),
            );
          if (args[1] === 'view')
            return Promise.resolve(
              JSON.stringify({
                id: version,
                annotations: { 'workers/message': `Commit ${input.commit}` },
              }),
            );
          expect(args).toEqual([
            'versions',
            'deploy',
            `${version}@100%`,
            '--yes',
            '--message',
            input.reason,
          ]);
          expect(guarded).toBe(true);
          active = version;
          return Promise.resolve('');
        },
        fetch(url) {
          expect(typeof url).toBe('string');
          const address = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
          return Promise.resolve(
            address.includes('lvbt-release.json')
              ? Response.json({
                  formatVersion: 1,
                  slug: 'home',
                  commit: wrongCommit ? 'b'.repeat(40) : input.commit,
                  artifactHash: 'c'.repeat(64),
                })
              : new Response('<h1>Labs</h1>'),
          );
        },
      });
      const result = await rollbackWorker(input, operations);
      expect(result.ok).toBe(!wrongCommit);
      expect(result.changed).toBe(wrongCommit ? null : true);
      const [directory] = await readdir(path.join(root, '.wrangler/rollbacks'));
      const journal = await readFile(
        path.join(root, '.wrangler/rollbacks', directory ?? '', 'journal.jsonl'),
        'utf8',
      );
      expect(journal).toContain('prepared');
      expect(journal).toContain(wrongCommit ? 'unconfirmed' : 'verified');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);

test('retired projects cannot restore write-capable versions', async () => {
  const manifest = LabManifestV1Schema.parse({
    ...home,
    slug: 'map',
    status: 'retired',
    dates: { ...home.dates, retired: '2026-09-05' },
    lifecycle: { reason: 'Ended' },
  });
  const operations = rollbackCloudflare('/unused', manifest, {
    run: () =>
      Promise.resolve(
        JSON.stringify({ id: version, resources: { bindings: [{ name: 'DB', type: 'd1' }] } }),
      ),
  });
  await expect(rollbackWorker({ ...input, slug: 'map', apply: false }, operations)).rejects.toThrow(
    /ASSETS/,
  );
});
