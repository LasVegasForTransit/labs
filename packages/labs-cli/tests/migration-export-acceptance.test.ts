import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from 'vitest';
import {
  verifyRelease,
  verifyWorkerReleaseConfiguration,
} from '@lasvegasfortransit/web-platform/release';
import { migrateLab } from '../src/migrate.js';
import { withMigrationFixture } from '../test-support/migration-fixture.js';

function runPnpm(directory: string, args: string[], env: NodeJS.ProcessEnv = {}) {
  const result = spawnSync('pnpm', args, {
    cwd: directory,
    encoding: 'utf8',
    env: { ...process.env, CI: '1', NO_COLOR: '1', ...env },
    timeout: 120000,
  });
  if (result.status !== 0)
    throw new Error(
      `pnpm ${args.join(' ')} failed (${String(result.status)}):\n${result.stdout}\n${result.stderr}`,
    );
  return result.stdout;
}

async function verifySavedExport(output: string, saved: string, commit: string) {
  const env = {
    LVBT_PREVIEW_URL: 'https://preview.example.org',
    LVBT_WORKERS_DEV_SUBDOMAIN: 'example',
  };
  const options = [
    '--app',
    'migration-example',
    '--directory',
    saved,
    '--commit',
    commit,
    '--release-id',
    '123',
  ];
  expect(runPnpm(output, ['exec', 'lvbt', 'release', 'package', ...options], env)).toContain(
    'artifactHash',
  );
  await expect(verifyRelease(saved)).resolves.toMatchObject({
    commit,
    releaseId: '123',
    app: 'migration-example',
    formatVersion: 2,
  });
  await verifyWorkerReleaseConfiguration(saved, {
    productionWorker: 'lvbt-labs-migration-example',
    previewWorker: 'lvbt-labs-migration-example-staging',
  });
  expect(() => runPnpm(output, ['exec', 'lvbt', 'release', 'verify', ...options], env)).toThrow(
    'requires --attestation-directory',
  );
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

        await verifySavedExport(
          output,
          path.join(outer, 'saved-release'),
          execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
        );

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
