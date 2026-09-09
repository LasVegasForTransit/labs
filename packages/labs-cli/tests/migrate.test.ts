import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';
import { migrateLab, migrationInput } from '../src/migrate.js';
import { withMigrationFixture } from '../test-support/migration-fixture.js';

test(
  'plans without writes, exports, and verifies an unchanged rerun',
  { timeout: 30000 },
  async () => {
    const outer = await mkdtemp(path.join(os.tmpdir(), 'lvbt-migrate-command-'));
    try {
      await withMigrationFixture(async (root) => {
        const output = path.join(outer, 'standalone');
        const args = [
          'migration-example',
          '--prepare',
          '--repository',
          'LasVegasForTransit/example',
          '--output',
          output,
          '--json',
        ];
        const plan = JSON.parse(
          execFileSync(
            process.execPath,
            [
              '--import',
              import.meta.resolve('tsx'),
              fileURLToPath(new URL('../src/cli.ts', import.meta.url)),
              'migrate',
              ...args,
            ],
            { cwd: root, encoding: 'utf8', timeout: 30000 },
          ),
        ) as {
          changed: boolean;
          phase: string;
        };
        expect(plan.changed).toBe(false);
        expect(plan.phase).toBe('export-planned');
        expect(await readdir(outer)).toEqual([]);
        const applied = await migrateLab(root, [...args, '--apply']);
        expect(applied.changed).toBe(true);
        expect(applied.phase).toBe('exported');
        expect((await migrateLab(root, [...args, '--apply'])).changed).toBe(false);
        await rm(path.join(output, '.git'), { recursive: true });
        expect((await migrateLab(root, [...args, '--apply'])).changed).toBe(true);
        expect(
          await readFile(path.join(root, 'apps/migration-example/lab.config.ts'), 'utf8'),
        ).toContain('migration-example');
        await writeFile(path.join(output, 'README.md'), 'Independent changes');
        await expect(migrateLab(root, [...args, '--apply'])).rejects.toThrow(/differs/);
        expect(await readFile(path.join(output, 'README.md'), 'utf8')).toBe('Independent changes');
        expect(await readdir(outer)).toEqual(['standalone']);
      });
    } finally {
      await rm(outer, { recursive: true, force: true });
    }
  },
);

test('rejects dirty source and output inside Labs', { timeout: 30000 }, async () => {
  await withMigrationFixture(async (root) => {
    const args = [
      'migration-example',
      '--prepare',
      '--repository',
      'LasVegasForTransit/example',
      '--output',
      path.join(root, 'export'),
      '--json',
    ];
    await expect(migrateLab(root, args)).rejects.toThrow(/outside/);
    await writeFile(path.join(root, 'uncommitted.txt'), 'Uncommitted source');
    await expect(
      migrateLab(root, [...args.slice(0, -2), path.join(root, '..', 'export'), '--json']),
    ).rejects.toThrow(/clean/);
  });
});

test.each([
  ['example', '--apply', '--dry-run'],
  ['example', '--prepare', '--slug', 'other'],
  ['example', '--prepare', '--json'],
  ['example', '--apply', '--json'],
])('rejects incomplete or contradictory migration flags: %j', async (...args) => {
  await expect(migrateLab(process.cwd(), args)).rejects.toThrow();
});

test('guided input fills missing fields and JSON calls never prompt', async () => {
  const answers = ['LasVegasForTransit/example', '/tmp/example'];
  const questions: string[] = [];
  const ask = (question: string) => {
    questions.push(question);
    return Promise.resolve(answers.shift() ?? '');
  };
  expect(await migrationInput(['example', '--prepare'], ask)).toEqual({
    slug: 'example',
    repository: 'LasVegasForTransit/example',
    output: '/tmp/example',
    apply: false,
  });
  expect(questions).toHaveLength(2);
  await expect(migrationInput(['--json'], ask)).rejects.toThrow(/Provide/);
  expect(questions).toHaveLength(2);
});
