import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from 'vitest';
import home from '../../../apps/home/lab.config.js';
import { LabManifestV1Schema } from '../src/manifest.js';
import { prepareRetirementArchive } from '../src/retirement-archive.js';

const identity = {
  manifest: LabManifestV1Schema.parse({
    ...home,
    slug: 'old-map',
    status: 'retired',
    dates: { ...home.dates, retired: '2026-09-05' },
    lifecycle: { reason: 'The project ended.' },
  }),
  sourceCommit: 'a'.repeat(40),
  sourceRepository: 'https://github.com/LasVegasForTransit/labs',
};

async function fixture(run: (root: string, app: string) => Promise<void>) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'lvbt-retirement-archive-'));
  const app = path.join(root, 'apps/old-map');
  try {
    await mkdir(app, { recursive: true });
    await writeFile(
      path.join(app, 'package.json'),
      JSON.stringify({ scripts: { 'build:archive': 'build', 'test:archive': 'test' } }),
    );
    await run(root, app);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test('builds before testing the captured archive, leaving project source intact', async () => {
  await fixture(async (root, app) => {
    const calls: string[] = [];
    const result = await prepareRetirementArchive(root, identity, async (script, options) => {
      calls.push(script);
      expect(options.cwd).toBe(app);
      if (script === 'build:archive') {
        await mkdir(path.join(app, 'dist-archive'));
        await writeFile(path.join(app, 'dist-archive/index.html'), '<h1>Captured</h1>');
      } else {
        const staged = options.archiveDirectory;
        expect(staged).toBeDefined();
        if (staged === undefined) throw new Error('Missing captured archive directory');
        expect(staged).not.toBe(path.join(app, 'dist-archive'));
        await writeFile(path.join(app, 'dist-archive/index.html'), 'changed build output');
        expect(await readFile(path.join(staged, 'index.html'), 'utf8')).toContain('Captured');
      }
    });
    expect(calls).toEqual(['build:archive', 'test:archive']);
    expect(await readFile(path.join(result.directory, 'site/index.html'), 'utf8')).toContain(
      'Captured',
    );
    await expect(access(path.join(app, 'package.json'))).resolves.toBeUndefined();
  });
});

test('requires an archive suite before running the build', async () => {
  await fixture(async (root, app) => {
    await writeFile(path.join(app, 'package.json'), '{"scripts":{"build:archive":"build"}}');
    await expect(
      prepareRetirementArchive(root, identity, () => {
        throw new Error('Must not execute');
      }),
    ).rejects.toThrow(/test:archive/);
  });
});

test('a failing browser suite cannot publish an archive', async () => {
  await fixture(async (root, app) => {
    await expect(
      prepareRetirementArchive(root, identity, async (script) => {
        if (script === 'test:archive') throw new Error('Offline workflow failed');
        await mkdir(path.join(app, 'dist-archive'));
        await writeFile(path.join(app, 'dist-archive/index.html'), '<h1>Captured</h1>');
      }),
    ).rejects.toThrow('Offline workflow failed');
    await expect(access(path.join(root, 'retired/old-map'))).rejects.toThrow();
    await expect(access(path.join(app, 'package.json'))).resolves.toBeUndefined();
  });
});
