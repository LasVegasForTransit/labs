import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';
import home from '../../../apps/home/lab.config.js';
import { discoverLabs, LabManifestV1Schema } from '../src/manifest.js';
import { storeRetirementArchive } from '../src/archive-store.js';
import { verifyRetiredArchives } from '../src/retired-integrity.js';

test('checks every repository archive and its retired catalog record', async () => {
  const root = fileURLToPath(new URL('../../../', import.meta.url));
  await verifyRetiredArchives(root, await discoverLabs(root));
});

test('requires a matching intact archive for retired catalog entries', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'lvbt-retired-integrity-'));
  const manifest = LabManifestV1Schema.parse({
    ...home,
    slug: 'old-map',
    status: 'retired',
    dates: { ...home.dates, retired: '2026-09-05' },
    lifecycle: { reason: 'Replaced.' },
  });
  try {
    await expect(verifyRetiredArchives(root, [manifest])).rejects.toThrow(/does not match/);
    const source = path.join(root, 'build');
    await mkdir(source);
    await writeFile(path.join(source, 'index.html'), '<h1>Archived map</h1>');
    await storeRetirementArchive(
      root,
      {
        manifest,
        sourceCommit: 'a'.repeat(40),
        sourceRepository: 'https://github.com/LasVegasForTransit/labs',
      },
      source,
      () => Promise.resolve(),
    );
    expect((await verifyRetiredArchives(root, [manifest])).size).toBe(1);
    await expect(
      verifyRetiredArchives(root, [{ ...manifest, title: 'Changed title' }]),
    ).rejects.toThrow(/does not match/);
    await writeFile(path.join(root, 'retired/old-map/site/index.html'), 'changed');
    await expect(verifyRetiredArchives(root, [manifest])).rejects.toThrow(/checksum/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
