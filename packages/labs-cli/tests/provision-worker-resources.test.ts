import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { reconcileResources } from '@lasvegasfortransit/web-platform/provision';
import type { LabManifestV1 } from '../src/manifest.js';
import {
  provisionWorkerPreviewResources,
  provisionWorkerResources,
} from '../src/provision-providers.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function manifest(slug: string, status: LabManifestV1['status']): LabManifestV1 {
  return {
    manifestVersion: 1,
    slug,
    title: slug,
    summary: `Summary for ${slug}.`,
    kind: 'tool',
    profile: 'app',
    status,
    visibility: status === 'draft' ? 'unlisted' : 'listed',
    maintainers: ['maintainer'],
    dates: { created: '2026-01-01' },
    previewImage: { path: 'public/preview.png', alt: `${slug} preview.` },
    licenses: { code: 'MIT', content: 'CC-BY-4.0', data: 'CC0-1.0', assets: 'MIT' },
  };
}

test('plans and uploads each missing source-backed published Worker once', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'lvbt-worker-provision-'));
  roots.push(root);
  await mkdir(path.join(root, 'apps/home'), { recursive: true });
  await writeFile(path.join(root, 'apps/home/lab.config.ts'), 'export default {};\n');
  await writeFile(path.join(root, 'apps/home/wrangler.jsonc'), '{}\n');

  const workers: { id: string }[] = [];
  const commands: { command: string; args: string[]; cwd: string }[] = [];
  const resources = await provisionWorkerResources(
    root,
    [manifest('home', 'active'), manifest('draft-map', 'draft')],
    () => Promise.resolve(workers),
    (command, args, options) => {
      commands.push({ command, args, cwd: options.cwd });
      if (args.includes('upload')) workers.push({ id: 'lvbt-labs-home' });
      return Promise.resolve();
    },
  );

  expect(resources.map((resource) => resource.id)).toEqual(['cloudflare.worker.lvbt-labs-home']);
  expect((await reconcileResources(resources, false)).operations[0]?.status).toBe('planned');
  expect(commands).toEqual([]);

  expect((await reconcileResources(resources, true)).ok).toBe(true);
  expect(commands).toEqual([
    {
      command: 'pnpm',
      args: ['--filter', '@lasvegasfortransit/lab-home', 'build'],
      cwd: root,
    },
    {
      command: 'pnpm',
      args: [
        'exec',
        'wrangler',
        'versions',
        'upload',
        '--strict',
        '--name',
        'lvbt-labs-home',
        '--message',
        'Provision inactive Worker identity for home.',
      ],
      cwd: path.join(root, 'apps/home'),
    },
  ]);

  commands.length = 0;
  expect((await reconcileResources(resources, true)).changed).toBe(false);
  expect(commands).toEqual([]);
});

test('rejects a published source lab without Worker configuration', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'lvbt-worker-provision-'));
  roots.push(root);
  await mkdir(path.join(root, 'apps/map'), { recursive: true });
  await writeFile(path.join(root, 'apps/map/lab.config.ts'), 'export default {};\n');

  await expect(
    provisionWorkerResources(root, [manifest('map', 'active')], () => Promise.resolve([])),
  ).rejects.toThrow(/wrangler\.jsonc/);
});

test('manages preview URLs for every Worker still deployed by Labs', async () => {
  const reads: string[] = [];
  const writes: Array<{ worker: string; settings: unknown }> = [];
  const resources = provisionWorkerPreviewResources(
    [
      manifest('home', 'active'),
      manifest('old-map', 'retired'),
      manifest('draft-map', 'draft'),
      manifest('graduated-map', 'graduated'),
    ],
    (worker) => {
      reads.push(worker);
      return Promise.resolve({ enabled: false, previews_enabled: false });
    },
    (worker, settings) => {
      writes.push({ worker, settings });
      return Promise.resolve();
    },
  );

  expect(resources.map(({ id }) => id)).toEqual([
    'cloudflare.worker-previews.lvbt-labs-home',
    'cloudflare.worker-previews.lvbt-labs-old-map',
  ]);
  await Promise.all(resources.map((resource) => resource.read()));
  expect(reads).toEqual(['lvbt-labs-home', 'lvbt-labs-old-map']);
  await Promise.all(
    resources.map((resource) =>
      resource.write(
        { enabled: false, previews_enabled: false },
        { enabled: false, previews_enabled: true },
      ),
    ),
  );
  expect(writes).toEqual([
    {
      worker: 'lvbt-labs-home',
      settings: { enabled: false, previews_enabled: true },
    },
    {
      worker: 'lvbt-labs-old-map',
      settings: { enabled: false, previews_enabled: true },
    },
  ]);
});
