import { execFileSync } from 'node:child_process';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from 'vitest';
import home from '../../../apps/home/lab.config.js';
import { finalizeMigration } from '../src/migration-finalize.js';

async function fixture(run: (root: string) => Promise<void>) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'lvbt-migration-finalize-'));
  const slug = 'map';
  const manifest = {
    ...home,
    slug,
    title: 'Map',
    status: 'active' as const,
    dates: { ...home.dates, published: '2026-09-01' },
  };
  const handoff = {
    formatVersion: 1 as const,
    slug,
    repository: 'LasVegasForTransit/map',
    sourceCommit: 'a'.repeat(40),
    destinationCommit: 'b'.repeat(40),
    previousVersion: '11111111-1111-4111-8111-111111111111',
    phase: 'destination-verified' as const,
    destinationVersion: '22222222-2222-4222-8222-222222222222',
    artifactHash: 'c'.repeat(64),
  };
  try {
    await mkdir(path.join(root, 'apps', slug), { recursive: true });
    await mkdir(path.join(root, 'migrations'), { recursive: true });
    await writeFile(
      path.join(root, 'apps', slug, 'lab.config.ts'),
      `export default ${JSON.stringify(manifest)} as const;\n`,
    );
    await writeFile(path.join(root, 'apps', slug, 'source.ts'), 'export const map = true;\n');
    await writeFile(
      path.join(root, 'migrations', `${slug}.json`),
      `${JSON.stringify(handoff, null, 2)}\n`,
    );
    execFileSync('git', ['init', '--quiet', '--initial-branch=main'], { cwd: root });
    execFileSync('git', ['add', '.'], { cwd: root });
    execFileSync(
      'git',
      [
        '-c',
        'user.name=Test',
        '-c',
        'user.email=test@example.org',
        'commit',
        '--quiet',
        '-m',
        'fixture',
      ],
      { cwd: root },
    );
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test('graduates only a live verified migration and keeps recoverable source', async () => {
  await fixture(async (root) => {
    const verify = () =>
      Promise.resolve({
        version: '22222222-2222-4222-8222-222222222222',
        artifactHash: 'c'.repeat(64),
      });
    const planned = await finalizeMigration(
      root,
      { slug: 'map', graduated: '2026-09-10', apply: false },
      verify,
    );
    expect(planned).toMatchObject({ changed: false, phase: 'finalization-planned' });
    const result = await finalizeMigration(
      root,
      { slug: 'map', graduated: '2026-09-10', apply: true },
      verify,
    );
    expect(result).toMatchObject({ changed: true, phase: 'graduated' });
    expect(JSON.parse(await readFile(path.join(root, 'catalog/map.json'), 'utf8'))).toMatchObject({
      slug: 'map',
      status: 'graduated',
      dates: { graduated: '2026-09-10' },
      sourceRepository: 'https://github.com/LasVegasForTransit/map',
    });
    await expect(access(path.join(root, 'apps/map'))).rejects.toThrow();
    await expect(access(path.join(root, 'migrations/map.json'))).rejects.toThrow();
    if (result.recovery === null) throw new Error('Missing migration recovery directory.');
    await expect(access(path.join(result.recovery, 'source/source.ts'))).resolves.toBeUndefined();
    await expect(access(path.join(result.recovery, 'handoff.json'))).resolves.toBeUndefined();
    const repeated = await finalizeMigration(
      root,
      { slug: 'map', graduated: '2026-09-10', apply: true },
      verify,
    );
    expect(repeated).toMatchObject({ changed: false, phase: 'graduated' });
  });
});

test('preserves source and handoff after failed live verification', async () => {
  await fixture(async (root) => {
    await expect(
      finalizeMigration(root, { slug: 'map', graduated: '2026-09-10', apply: true }, () =>
        Promise.reject(new Error('Stable route mismatch')),
      ),
    ).rejects.toThrow(/Stable route mismatch/);
    await expect(access(path.join(root, 'apps/map/source.ts'))).resolves.toBeUndefined();
    await expect(access(path.join(root, 'migrations/map.json'))).resolves.toBeUndefined();
    await expect(access(path.join(root, 'catalog/map.json'))).rejects.toThrow();
  });
});
