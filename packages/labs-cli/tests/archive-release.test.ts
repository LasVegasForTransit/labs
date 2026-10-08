import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from 'vitest';
import home from '../../../apps/home/lab.config.js';
import { LabManifestV1Schema } from '../src/manifest.js';
import { storeRetirementArchive, verifyStoredArchive } from '../src/archive-store.js';
import { prepareArchiveRelease } from '../src/archive-release.js';
import { typedWorkerConfiguration } from '@lasvegasfortransit/web-platform/release';

const profile = {
  repository: 'LasVegasForTransit/labs',
  profile: 'map',
  appDirectory: '.wrangler/archive-releases/map',
  typedConfig: 'cloudflare.config.mjs',
  assetsDirectory: 'assets',
  productionWorker: 'lvbt-labs-map',
  previewWorker: 'lvbt-labs-map-staging',
  productionUrl: 'https://labs.lasvegasfortransit.org',
  previewUrl: 'https://lvbt-labs-map-staging.las-vegas-for-better-transit.workers.dev',
  workersDevSubdomain: 'las-vegas-for-better-transit',
  publicPath: '/map/',
  artifactPrefix: 'lab-map-release',
  previewBindings: { ASSETS: { type: 'assets' } },
  artifactSource: 'typed-worker' as const,
  stagingWorkflow: {
    name: 'Stage Labs release',
    path: '.github/workflows/deploy.yml',
    branch: 'main',
  },
  promotionWorkflow: { file: 'promote.yml', titlePrefix: 'Promote Labs release', branch: 'main' },
};
async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'labs-archive-release-'));
  const source = path.join(root, 'source');
  await mkdir(source);
  await writeFile(path.join(source, 'index.html'), '<h1>Retired map</h1>');
  const manifest = LabManifestV1Schema.parse({
    ...home,
    slug: 'map',
    status: 'retired',
    dates: { ...home.dates, retired: '2026-09-05' },
    lifecycle: { reason: 'Ended' },
  });
  await storeRetirementArchive(
    root,
    {
      manifest,
      sourceCommit: 'a'.repeat(40),
      sourceRepository: 'https://github.com/LasVegasForTransit/labs',
    },
    source,
    async () => {},
  );
  return root;
}

test('verified archive bytes become an ASSETS-only canonical release without changing the retained archive', async () => {
  const root = await fixture();
  try {
    const before = await readFile(path.join(root, 'retired/map/checksums.sha256'), 'utf8');
    const generated = await prepareArchiveRelease(root, 'map', profile);
    const normalized = typedWorkerConfiguration(generated.production, profile, generated.preview);
    expect(normalized).toMatchObject({
      name: 'lvbt-labs-map',
      unsafe: { metadata: { keep_bindings: [] } },
      assets: { run_worker_first: true },
      routes: [
        { pattern: 'labs.lasvegasfortransit.org/map' },
        { pattern: 'labs.lasvegasfortransit.org/map/*' },
      ],
      env: { preview: { name: 'lvbt-labs-map-staging', routes: [], triggers: { crons: [] } } },
    });
    expect(generated.production.worker.env).toEqual({ ASSETS: { type: 'assets' } });
    expect(generated.preview.worker.env).toEqual({ ASSETS: { type: 'assets' } });
    expect(await readFile(path.join(root, 'retired/map/checksums.sha256'), 'utf8')).toBe(before);
    await verifyStoredArchive(path.join(root, 'retired/map'));
    expect(
      await readFile(path.join(generated.directory, 'cloudflare.config.mjs'), 'utf8'),
    ).toContain('mode');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('tampered archive and write-capable or mismatched profile are rejected before generation', async () => {
  const root = await fixture();
  try {
    await expect(
      prepareArchiveRelease(root, 'map', {
        ...profile,
        previewBindings: { DB: { type: 'd1', id: 'x' } },
      }),
    ).rejects.toThrow(/ASSETS/);
    await expect(
      prepareArchiveRelease(root, 'map', { ...profile, productionWorker: 'lvbt-labs-home' }),
    ).rejects.toThrow(/identity/);
    await writeFile(path.join(root, 'retired/map/site/index.html'), 'tampered');
    await expect(prepareArchiveRelease(root, 'map', profile)).rejects.toThrow(/checksum/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
