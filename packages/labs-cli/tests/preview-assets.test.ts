import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from 'vitest';

import { preparePreviewAssets } from '../src/preview-assets.js';

test('prebuilt acceptance preserves the files another preview is serving', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'labs-prebuilt-'));
  const entry = path.join(root, 'apps/home/dist/index.html');
  try {
    await mkdir(path.dirname(entry), { recursive: true });
    await writeFile(entry, 'currently served artifact');
    await preparePreviewAssets(root, ['home'], true, async () => {
      await writeFile(entry, 'unexpected rebuild');
    });
    expect(await readFile(entry, 'utf8')).toBe('currently served artifact');
    await expect(
      preparePreviewAssets(root, ['home', 'missing'], true, () =>
        Promise.reject(new Error('acceptance must never rebuild')),
      ),
    ).rejects.toThrow('Missing built preview assets for missing; run pnpm build first.');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('interactive preview builds before checking its assets', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'labs-preview-build-'));
  const entry = path.join(root, 'apps/home/dist/index.html');
  try {
    await preparePreviewAssets(root, ['home'], false, async () => {
      await mkdir(path.dirname(entry), { recursive: true });
      await writeFile(entry, 'fresh interactive artifact');
    });
    expect(await readFile(entry, 'utf8')).toBe('fresh interactive artifact');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
