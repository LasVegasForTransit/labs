import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from 'vitest';
import home from '../../../apps/home/lab.config.js';
import { discoverLabs } from '../src/manifest.js';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const retired = {
  ...home,
  slug: 'old-map',
  status: 'retired',
  dates: { ...home.dates, retired: '2026-09-05' },
  lifecycle: { reason: 'Replaced by a maintained map.' },
};

async function fixture(run: (root: string) => Promise<void>) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'lvbt-catalog-'));
  try {
    await mkdir(path.join(root, 'apps'));
    await mkdir(path.join(root, 'catalog'));
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test('discovers retired and graduated records without app source, in slug order', async () => {
  await fixture(async (root) => {
    await writeFile(path.join(root, 'catalog/old-map.json'), JSON.stringify(retired));
    await writeFile(
      path.join(root, 'catalog/graduate.json'),
      JSON.stringify({
        ...home,
        slug: 'graduate',
        status: 'graduated',
        visibility: 'unlisted',
        dates: { ...home.dates, graduated: '2026-09-05' },
        sourceRepository: 'https://github.com/LasVegasForTransit/graduate',
      }),
    );
    const records = await discoverLabs(root);
    expect(records.map((record) => record.slug)).toEqual(['graduate', 'old-map']);
    expect(records[0]?.visibility).toBe('unlisted');
    expect(records[1]).toEqual(retired);
  });
});

test.each([
  ['wrong-name.json', retired],
  ['old-map.json', { ...retired, status: 'active' }],
  ['home.json', { ...retired, slug: 'home' }],
])('rejects invalid metadata records (%s)', async (name, record) => {
  await fixture(async (root) => {
    await writeFile(path.join(root, 'catalog', name), JSON.stringify(record));
    await expect(discoverLabs(root)).rejects.toThrow();
  });
});

test('rejects duplicate ownership between app source and catalog records', async () => {
  await fixture(async (root) => {
    await mkdir(path.join(root, 'apps/old-map'));
    await writeFile(
      path.join(root, 'apps/old-map/lab.config.ts'),
      `export default ${JSON.stringify(retired)};`,
    );
    await writeFile(path.join(root, 'catalog/old-map.json'), JSON.stringify(retired));
    await expect(discoverLabs(root)).rejects.toThrow(/duplicate/i);
  });
});

test('rejects symbolic links instead of reading catalog data outside the repository', async () => {
  await fixture(async (root) => {
    await writeFile(path.join(root, 'external.json'), JSON.stringify(retired));
    await symlink(path.join(root, 'external.json'), path.join(root, 'catalog/old-map.json'));
    await expect(discoverLabs(root)).rejects.toThrow(/regular file/i);
  });
});

test('the status command reads a catalog-only lab without starting its old app', async () => {
  await fixture(async (root) => {
    await writeFile(path.join(root, 'catalog/old-map.json'), JSON.stringify(retired));
    const output = execFileSync(
      process.execPath,
      [
        '--import',
        import.meta.resolve('tsx'),
        fileURLToPath(new URL('../src/cli.ts', import.meta.url)),
        'status',
        'old-map',
        '--json',
      ],
      { cwd: root, encoding: 'utf8' },
    );
    const result: unknown = JSON.parse(output);
    expect(result).toMatchObject({ ok: true, results: [{ manifest: retired }] });
  });
});
