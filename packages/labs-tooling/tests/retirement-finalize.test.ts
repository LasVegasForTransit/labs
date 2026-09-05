import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from 'vitest';
import home from '../../../apps/home/lab.config.js';
import { archiveChecksums, readArchiveFiles } from '../src/archive-files.js';
import { storeRetirementArchive } from '../src/archive-store.js';
import { LabManifestV1Schema } from '../src/manifest.js';
import { finalizeRetirement } from '../src/retirement-finalize.js';

const manifest = LabManifestV1Schema.parse({
  ...home,
  slug: 'map',
  status: 'retired',
  dates: { ...home.dates, retired: '2026-09-05' },
  lifecycle: { reason: 'Ended' },
});

async function fixture(run: (root: string, commit: string) => Promise<void>) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'lvbt-retirement-finalize-'));
  try {
    await mkdir(path.join(root, 'apps/map'), { recursive: true });
    await writeFile(
      path.join(root, 'apps/map/lab.config.ts'),
      `export default ${JSON.stringify(manifest)};\n`,
    );
    await writeFile(path.join(root, 'apps/map/source.ts'), 'export const map = 1;\n');
    await writeFile(path.join(root, 'apps/map/index.html'), '<h1>Map</h1>');
    await storeRetirementArchive(
      root,
      {
        manifest,
        sourceCommit: 'a'.repeat(40),
        sourceRepository: 'https://github.com/LasVegasForTransit/labs',
      },
      path.join(root, 'apps/map'),
      () => Promise.resolve(),
    );
    const files = await readArchiveFiles(root);
    execFileSync('git', ['init', '--quiet', '--initial-branch=fixture'], { cwd: root });
    let input =
      'commit refs/heads/main\ncommitter Test <test@example.org> 1 +0000\ndata 7\nfixture\n';
    for (const [name, bytes] of files)
      input += `M 100644 inline ${name}\ndata ${bytes.length}\n${bytes.toString()}\n`;
    execFileSync('git', ['fast-import', '--quiet'], { cwd: root, input: `${input}\n` });
    execFileSync('git', ['symbolic-ref', 'HEAD', 'refs/heads/main'], { cwd: root });
    execFileSync('git', ['read-tree', 'HEAD'], { cwd: root });
    await run(
      root,
      execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

const versions = {
  slug: 'map',
  version: '2ae50b24-3d42-48d2-a784-627b60841961',
  previousVersion: '1c4deaba-ee53-4c3f-ba65-176ae596cad5',
};

test('finalizes only after verification and keeps a recoverable source directory', async () => {
  await fixture(async (root, commit) => {
    const identity = { ...versions, commit };
    await writeFile(path.join(root, '.git/info/exclude'), 'apps/map/local-note.txt\n');
    await writeFile(path.join(root, 'apps/map/local-note.txt'), 'Keep this ignored local file.');
    const verify = async () => {
      const site = await readArchiveFiles(path.join(root, 'retired/map/site'));
      return {
        ...identity,
        formatVersion: 1 as const,
        verified: true as const,
        artifactHash: createHash('sha256').update(archiveChecksums(site)).digest('hex'),
      };
    };
    expect((await finalizeRetirement(root, identity, false, verify)).changed).toBe(false);
    await expect(access(path.join(root, 'catalog/map.json'))).rejects.toThrow();
    const result = await finalizeRetirement(root, identity, true, verify);
    expect(result.changed).toBe(true);
    expect(JSON.parse(await readFile(path.join(root, 'catalog/map.json'), 'utf8'))).toEqual(
      manifest,
    );
    await expect(access(path.join(root, 'apps/map'))).rejects.toThrow();
    if (result.recovery === null) throw new Error('Missing recovery directory');
    expect(await readFile(path.join(result.recovery, 'source/source.ts'), 'utf8')).toContain(
      'map = 1',
    );
    const repeated = await finalizeRetirement(root, identity, true, verify);
    expect(await readFile(path.join(result.recovery, 'source/local-note.txt'), 'utf8')).toBe(
      'Keep this ignored local file.',
    );
    expect(repeated.changed).toBe(false);
  });
});

test('rejects an existing catalog collision before live verification', async () => {
  await fixture(async (root, commit) => {
    await mkdir(path.join(root, 'catalog'));
    await writeFile(path.join(root, 'catalog/map.json'), '{"title":"Other project"}');
    let verified = false;
    await expect(
      finalizeRetirement(root, { ...versions, commit }, true, () => {
        verified = true;
        throw new Error('Must not verify');
      }),
    ).rejects.toThrow(/catalog record/);
    expect(verified).toBe(false);
    expect(await readFile(path.join(root, 'catalog/map.json'), 'utf8')).toBe(
      '{"title":"Other project"}',
    );
    await expect(access(path.join(root, 'apps/map/source.ts'))).resolves.toBeUndefined();
  });
});

test.each(['failed-verification', 'concurrent-edit'] as const)(
  'preserves source after %s',
  async (failure) => {
    await fixture(async (root, commit) => {
      const identity = { ...versions, commit };
      await expect(
        finalizeRetirement(root, identity, true, async () => {
          if (failure === 'failed-verification') throw new Error('Wrong live archive');
          await writeFile(path.join(root, 'apps/map/source.ts'), 'new work');
          const site = await readArchiveFiles(path.join(root, 'retired/map/site'));
          return {
            ...identity,
            formatVersion: 1 as const,
            verified: true as const,
            artifactHash: createHash('sha256').update(archiveChecksums(site)).digest('hex'),
          };
        }),
      ).rejects.toThrow();
      await expect(access(path.join(root, 'apps/map/source.ts'))).resolves.toBeUndefined();
      await expect(access(path.join(root, 'catalog/map.json'))).rejects.toThrow();
    });
  },
);
