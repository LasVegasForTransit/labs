import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';
import { z } from 'zod';

const repository = fileURLToPath(new URL('../../../', import.meta.url));
const dryRun = z.object({ tasks: z.array(z.object({ taskId: z.string(), hash: z.string() })) });

function hashes(root: string) {
  const output = execFileSync(
    path.join(repository, 'node_modules/.bin/turbo'),
    ['run', 'build', 'test', '--dry=json'],
    { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );
  return dryRun
    .parse(JSON.parse(output))
    .tasks.filter((task) =>
      ['@lvbt/lab-home#build', '@lvbt/labs-tooling#test'].includes(task.taskId),
    );
}

test('catalog records and app manifests invalidate home builds and catalog validation', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'lvbt-cache-inputs-'));
  try {
    await copyFile(path.join(repository, 'turbo.json'), path.join(root, 'turbo.json'));
    await writeFile(
      path.join(root, 'package.json'),
      JSON.stringify({ name: 'cache-fixture', packageManager: 'pnpm@11.25.0', private: true }),
    );
    await writeFile(path.join(root, 'pnpm-workspace.yaml'), 'packages:\n  - apps/*\n');
    await mkdir(path.join(root, 'catalog'));
    for (const name of ['lab-home', 'lab-transit-funding', 'labs-tooling']) {
      const directory = path.join(root, 'apps', name);
      await mkdir(directory, { recursive: true });
      await writeFile(
        path.join(directory, 'package.json'),
        JSON.stringify({ name: `@lvbt/${name}`, scripts: { build: 'true', test: 'true' } }),
      );
    }
    const original = hashes(root);
    expect(original).toHaveLength(2);
    await writeFile(path.join(root, 'catalog/retired-map.json'), '{}');
    const catalogChanged = hashes(root);
    expect(catalogChanged.every((task, index) => task.hash !== original[index]?.hash)).toBe(true);
    await writeFile(
      path.join(root, 'apps/lab-transit-funding/lab.config.ts'),
      'export default {};',
    );
    const manifestChanged = hashes(root);
    expect(manifestChanged.every((task, index) => task.hash !== catalogChanged[index]?.hash)).toBe(
      true,
    );
    await mkdir(path.join(root, 'retired'));
    await writeFile(path.join(root, 'retired/checksum-probe'), 'changed');
    expect(hashes(root).every((task, index) => task.hash !== manifestChanged[index]?.hash)).toBe(
      true,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
