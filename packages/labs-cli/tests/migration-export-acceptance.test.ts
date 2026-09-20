import { spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from 'vitest';
import { migrateLab } from '../src/migrate.js';
import { withMigrationFixture } from '../test-support/migration-fixture.js';

function runPnpm(directory: string, args: string[], timeout = 120000) {
  const result = spawnSync('pnpm', args, {
    cwd: directory,
    encoding: 'utf8',
    env: { ...process.env, CI: '1', NO_COLOR: '1' },
    timeout,
  });
  if (result.status !== 0)
    throw new Error(
      `pnpm ${args.join(' ')} failed (${String(result.status)}):\n${result.stdout}\n${result.stderr}`,
    );
  return result.stdout;
}

test(
  'exports a standalone project that installs, checks, builds, and passes configured acceptance',
  { timeout: 300000 },
  async () => {
    const outer = await mkdtemp(path.join(os.tmpdir(), 'lvbt-migrate-acceptance-'));
    try {
      await withMigrationFixture(async (root) => {
        const output = path.join(outer, 'standalone');
        await migrateLab(root, [
          'migration-example',
          '--prepare',
          '--repository',
          'LasVegasForTransit/example',
          '--output',
          output,
          '--apply',
          '--json',
        ]);

        expect(runPnpm(output, ['install', '--no-frozen-lockfile'])).toContain('Done');
        expect(runPnpm(output, ['check'])).toContain('Tasks:');
        expect(runPnpm(output, ['build'])).toContain('Tasks:');
        expect(runPnpm(output, ['build:archive'])).toContain('Tasks:');

        if (process.env.LVBT_MIGRATION_BROWSER_ACCEPTANCE === '1') {
          expect(runPnpm(output, ['test:e2e'])).toContain('passed');
          expect(runPnpm(output, ['test:archive'])).toContain('passed');
        }
      });
    } finally {
      await rm(outer, { recursive: true, force: true });
    }
  },
);
