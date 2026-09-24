import { execFileSync } from 'node:child_process';
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from 'vitest';
import { migrateLab, migrationInput } from '../src/migrate.js';
import { withMigrationFixture } from '../test-support/migration-fixture.js';

test('accepts a separate destination provisioning phase', async () => {
  expect(
    await migrationInput([
      'example',
      '--provision',
      '--repository',
      'LasVegasForTransit/example',
      '--output',
      '/tmp/example',
      '--json',
    ]),
  ).toEqual({
    phase: 'provision',
    slug: 'example',
    repository: 'LasVegasForTransit/example',
    output: '/tmp/example',
    apply: false,
  });
});

test('provisions only a clean committed standalone export', { timeout: 30000 }, async () => {
  const outer = await mkdtemp(path.join(os.tmpdir(), 'lvbt-migrate-provision-'));
  try {
    await withMigrationFixture(async (root) => {
      const output = path.join(outer, 'standalone');
      const args = [
        'migration-example',
        '--repository',
        'LasVegasForTransit/example',
        '--output',
        output,
        '--json',
      ];
      await migrateLab(root, [...args, '--prepare', '--apply']);
      await expect(migrateLab(root, [...args, '--provision'])).rejects.toThrow(/commit/i);

      const message = path.join(outer, 'message.txt');
      await writeFile(message, 'test: Standalone export\n');
      execFileSync('git', ['fast-import', '--quiet'], {
        cwd: output,
        input:
          'commit refs/heads/main\ncommitter Test <test@example.org> 1 +0000\ndata 5\nseed\n\nM 100644 inline .seed\ndata 2\nx\n',
      });
      execFileSync(
        'sh',
        [
          '-c',
          'git restore --staged . && git add -A && git -c core.hooksPath=/dev/null -c user.name=Test -c user.email=test@example.org commit -F "$1"',
          'sh',
          message,
        ],
        { cwd: output, encoding: 'utf8' },
      );
      const commit = execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: output,
        encoding: 'utf8',
      }).trim();
      const resolvedOutput = await realpath(output);
      let calls = 0;
      const result = await migrateLab(root, [...args, '--provision'], {
        provision: (_root, input) => {
          calls += 1;
          expect(input).toMatchObject({ output: resolvedOutput, commit, apply: false });
          return Promise.resolve({
            command: 'migrate',
            ok: true,
            changed: false,
            phase: 'provision-planned',
          });
        },
      });
      expect(result.phase).toBe('provision-planned');
      expect(calls).toBe(1);
      await writeFile(path.join(output, 'uncommitted.txt'), 'change');
      await expect(
        migrateLab(root, [...args, '--provision'], {
          provision: () => {
            throw new Error('Provider must not run for dirty source.');
          },
        }),
      ).rejects.toThrow(/clean/i);
    });
  } finally {
    await rm(outer, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});
