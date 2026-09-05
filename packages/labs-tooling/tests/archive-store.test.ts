import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from 'vitest';
import home from '../../../apps/home/lab.config.js';
import { storeRetirementArchive, verifyStoredArchive } from '../src/archive-store.js';
import { LabManifestV1Schema } from '../src/manifest.js';
import { archiveChecksums, readArchiveFiles } from '../src/archive-files.js';

const manifest = LabManifestV1Schema.parse({
  ...home,
  slug: 'old-map',
  status: 'retired' as const,
  dates: { ...home.dates, retired: '2026-09-05' },
  lifecycle: { reason: 'The project ended.' },
});
const identity = {
  manifest,
  sourceCommit: 'a'.repeat(40),
  sourceRepository: 'https://github.com/LasVegasForTransit/labs',
};

test.each(['missing', 'ambiguous'])(
  'rejects a %s index even with valid checksums',
  async (state) => {
    await fixture(async (root, source) => {
      const { directory } = await storeRetirementArchive(root, identity, source, () =>
        Promise.resolve(),
      );
      if (state === 'missing') {
        await rm(path.join(directory, 'site/index.html'));
      } else {
        await mkdir(path.join(directory, 'site/old-map'));
        await writeFile(path.join(directory, 'site/old-map/index.html'), '<h1>Another index</h1>');
      }
      const files = await readArchiveFiles(directory);
      files.delete('checksums.sha256');
      await writeFile(path.join(directory, 'checksums.sha256'), archiveChecksums(files));
      await expect(verifyStoredArchive(directory)).rejects.toThrow(/index/);
    });
  },
);

async function fixture(run: (root: string, source: string) => Promise<void>) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'lvbt-archive-store-'));
  const source = path.join(root, 'build');
  try {
    await mkdir(source);
    await writeFile(path.join(source, 'index.html'), '<h1>Archived map</h1>');
    await run(root, source);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test('persists only after verifying the staged snapshot and preserves provenance', async () => {
  await fixture(async (root, source) => {
    const result = await storeRetirementArchive(root, identity, source, async (staged) => {
      expect(staged).not.toBe(source);
      expect(await readFile(path.join(staged, 'index.html'), 'utf8')).toContain('Archived map');
      await expect(access(path.join(root, 'retired/old-map'))).rejects.toThrow();
      await writeFile(path.join(source, 'index.html'), 'changed after capture');
    });
    expect(result.changed).toBe(true);
    const stored = await verifyStoredArchive(path.join(root, 'retired/old-map'));
    expect(stored.manifest).toEqual(manifest);
    expect(stored.provenance).toMatchObject({
      sourceCommit: identity.sourceCommit,
      sourceRepository: identity.sourceRepository,
      sourcePath: 'apps/old-map',
    });
    expect(await readFile(path.join(root, 'retired/old-map/site/index.html'), 'utf8')).toContain(
      'Archived map',
    );
  });
});

test('verification failures and changes to the staged snapshot leave no archive', async () => {
  await fixture(async (root, source) => {
    await expect(
      storeRetirementArchive(root, identity, source, () =>
        Promise.reject(new Error('Offline workflow failed')),
      ),
    ).rejects.toThrow('Offline workflow failed');
    await expect(access(path.join(root, 'retired/old-map'))).rejects.toThrow();
    await expect(
      storeRetirementArchive(root, identity, source, async (staged) => {
        await writeFile(path.join(staged, 'index.html'), 'different from tested snapshot');
      }),
    ).rejects.toThrow(/changed during verification/);
    await expect(access(path.join(root, 'retired/old-map'))).rejects.toThrow();
  });
});

test('identical reruns verify again without replacing the stored artifact', async () => {
  await fixture(async (root, source) => {
    let verifications = 0;
    const verify = () => {
      verifications += 1;
      return Promise.resolve();
    };
    await storeRetirementArchive(root, identity, source, verify);
    expect((await storeRetirementArchive(root, identity, source, verify)).changed).toBe(false);
    expect(verifications).toBe(2);
    await writeFile(path.join(source, 'index.html'), 'different archive');
    await expect(storeRetirementArchive(root, identity, source, verify)).rejects.toThrow(
      /already exists/,
    );
    expect(await readFile(path.join(root, 'retired/old-map/site/index.html'), 'utf8')).toContain(
      'Archived map',
    );
  });
});

test('refuses metadata changed by the verification process', async () => {
  await fixture(async (root, source) => {
    await expect(
      storeRetirementArchive(root, identity, source, async (staged) => {
        await writeFile(path.join(staged, '../provenance.json'), '{}');
      }),
    ).rejects.toThrow(/changed during verification/);
    await expect(access(path.join(root, 'retired/old-map'))).rejects.toThrow();
  });
});

test('detects edited, added, and removed files in stored artifacts', async () => {
  await fixture(async (root, source) => {
    await storeRetirementArchive(root, identity, source, async () => {});
    const directory = path.join(root, 'retired/old-map');
    await writeFile(path.join(directory, 'unexpected.txt'), 'extra');
    await expect(verifyStoredArchive(directory)).rejects.toThrow(/checksum/);
    await rm(path.join(directory, 'unexpected.txt'));
    await writeFile(path.join(directory, 'site/index.html'), 'tampered');
    await expect(verifyStoredArchive(directory)).rejects.toThrow(/checksum/);
    await rm(path.join(directory, 'site/index.html'));
    await expect(verifyStoredArchive(directory)).rejects.toThrow(/checksum/);
  });
});

test('returns verified site bytes that do not change with the stored files', async () => {
  await fixture(async (root, source) => {
    const stored = await storeRetirementArchive(root, identity, source, () => Promise.resolve());
    const snapshot = await verifyStoredArchive(stored.directory);
    await writeFile(path.join(stored.directory, 'site/index.html'), 'changed after verification');
    expect(snapshot.site.get('index.html')?.toString()).toContain('Archived map');
    expect(snapshot.site.has('manifest.json')).toBe(false);
  });
});
