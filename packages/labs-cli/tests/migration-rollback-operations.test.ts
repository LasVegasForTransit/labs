import { mkdir, writeFile, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from 'vitest';
import { migrationRollbackOperations } from '../src/migration-rollback-operations.js';
const input = {
  slug: 'example',
  repository: 'LasVegasForTransit/example',
  sourceCommit: 'a'.repeat(40),
};

test.each(['paused', 'verified', 'drift'] as const)(
  'rollback %s rechecks the current phase version before retained recovery',
  async (phase) => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'lvbt-migration-rollback-'));
    const record = {
      formatVersion: 1 as const,
      ...input,
      destinationCommit: 'b'.repeat(40),
      previousVersion: '11111111-1111-4111-8111-111111111111',
      previousRelease: { releaseId: '123', commit: 'c'.repeat(40) },
      ...(phase === 'paused'
        ? { phase: 'labs-paused' as const }
        : {
            phase: 'destination-verified' as const,
            destinationVersion: '22222222-2222-4222-8222-222222222222',
            artifactHash: 'd'.repeat(64),
          }),
    };
    const expectedVersion =
      phase === 'paused' ? record.previousVersion : '22222222-2222-4222-8222-222222222222';
    let owner = true;
    const events: string[] = [];
    try {
      await mkdir(path.join(root, '.lvbt'), { recursive: true });
      await writeFile(
        path.join(root, '.lvbt/tooling.json'),
        JSON.stringify({
          version: 1,
          release: {
            repository: 'LasVegasForTransit/labs',
            apps: {
              example: {
                appDirectory: 'deploy/example',
                productionWorker: 'lvbt-labs-example',
                previewWorker: 'lvbt-labs-example-staging',
                productionUrl: 'https://labs.lasvegasfortransit.org',
                previewUrl: 'https://preview.example.org',
                artifactPrefix: 'example-release',
                publicPath: '/example/',
              },
            },
            stagingWorkflow: {
              name: 'Stage Labs release',
              path: '.github/workflows/deploy.yml',
              branch: 'main',
            },
            promotionWorkflow: {
              file: 'promote.yml',
              titlePrefix: 'Promote Labs release',
              branch: 'main',
            },
          },
        }),
      );
      await mkdir(path.join(root, 'migrations'), { recursive: true });
      await writeFile(path.join(root, 'migrations/example.json'), JSON.stringify(record));
      const operations = migrationRollbackOperations(root, input.slug, {
        github: (args) => {
          if (args[0] === 'variable' && args[1] === 'set') {
            owner = false;
            events.push('destination-disabled');
            return '';
          }
          if (args[0] === 'variable') return String(owner);
          if (args.at(-1)?.endsWith('/commits/main'))
            return JSON.stringify({ sha: record.destinationCommit });
          return JSON.stringify({ check_runs: [] });
        },
        async promote(_, selection) {
          await Promise.resolve();
          expect(owner).toBe(false);
          expect(selection).toMatchObject({
            app: input.slug,
            runId: record.previousRelease.releaseId,
            commit: record.previousRelease.commit,
            expectedVersion,
          });
          events.push('retained-promotion');
          return { app: input.slug, runId: '123', ok: true, changed: true, errors: [] };
        },
        fetch: () => {
          events.push('public-marker');
          return Promise.resolve(Response.json({ app: input.slug, ...record.previousRelease }));
        },
        wrangler: (args) => {
          expect(args).toEqual(['deployments', 'list', '--json', '--name', 'lvbt-labs-example']);
          events.push('current-version');
          return Promise.resolve(
            JSON.stringify([
              {
                created_on: '2026-10-07T00:00:00Z',
                versions: [
                  {
                    version_id: phase === 'drift' ? record.previousVersion : expectedVersion,
                    percentage: 100,
                  },
                ],
              },
            ]),
          );
        },
        guard: () => undefined,
      });
      await operations.setDestinationOwner(false);
      if (phase === 'drift') {
        await expect(operations.restore(record)).rejects.toThrow(/changed|reconcile/i);
        expect(events).toEqual(['destination-disabled', 'current-version']);
        await expect(operations.read()).resolves.toEqual(record);
        return;
      }
      await operations.restore(record);
      await operations.verifyRestored(record);
      await operations.removeHandoff(record);
      await expect(operations.read()).resolves.toBeNull();
      expect(events).toEqual([
        'destination-disabled',
        'current-version',
        'retained-promotion',
        'public-marker',
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);
