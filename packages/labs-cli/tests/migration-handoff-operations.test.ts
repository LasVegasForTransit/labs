import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from 'vitest';
import {
  migrationPauseOperations,
  migrationTransferOperations,
} from '../src/migration-handoff-operations.js';

const input = {
  slug: 'example',
  repository: 'LasVegasForTransit/example',
  sourceCommit: 'a'.repeat(40),
};

test('inspects the exact destination commit, disabled owner, and successful Validate check', async () => {
  const commands: string[][] = [];
  const operations = migrationPauseOperations('/tmp/labs', input, {
    github: (args) => {
      commands.push(args);
      if (args[0] === 'variable') return 'false\n';
      if (args.at(-1)?.endsWith('/commits/main')) return JSON.stringify({ sha: 'b'.repeat(40) });
      return JSON.stringify({
        check_runs: [
          {
            name: 'Validate',
            status: 'completed',
            conclusion: 'success',
            head_sha: 'b'.repeat(40),
          },
        ],
      });
    },
    wrangler: () => Promise.resolve('[]'),
    guard: () => undefined,
  });

  await expect(operations.inspectDestination()).resolves.toEqual({
    commit: 'b'.repeat(40),
    deploymentOwner: false,
    validate: 'success',
  });
  expect(commands).toHaveLength(3);
});

test('reads and writes the handoff record without replacing existing state', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'lvbt-migration-handoff-'));
  try {
    const operations = migrationPauseOperations(root, input, {
      github: () => '',
      wrangler: () => Promise.resolve('[]'),
      guard: () => undefined,
    });
    expect(await operations.read()).toBeNull();
    const record = {
      formatVersion: 1 as const,
      ...input,
      destinationCommit: 'b'.repeat(40),
      previousVersion: '11111111-1111-4111-8111-111111111111',
      phase: 'labs-paused' as const,
    };
    await operations.write(record);
    expect(await operations.read()).toEqual(record);
    await expect(operations.write(record)).rejects.toThrow(/already exists/);
    expect(JSON.parse(await readFile(path.join(root, 'migrations/example.json'), 'utf8'))).toEqual(
      record,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('reads the active Worker version through the standard parser', async () => {
  const version = '11111111-1111-4111-8111-111111111111';
  const operations = migrationPauseOperations('/tmp/labs', input, {
    github: () => '',
    wrangler: (args) => {
      expect(args).toEqual(['deployments', 'list', '--json', '--name', 'lvbt-labs-example']);
      return Promise.resolve(
        JSON.stringify([
          {
            created_on: '2026-09-01T00:00:00Z',
            versions: [{ version_id: version, percentage: 100 }],
          },
        ]),
      );
    },
    guard: () => undefined,
  });
  await expect(operations.activeVersion()).resolves.toBe(version);
});

test('transfer operations change only the destination owner and dispatch main', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'lvbt-migration-transfer-'));
  try {
    const record = {
      formatVersion: 1 as const,
      ...input,
      destinationCommit: 'b'.repeat(40),
      previousVersion: '11111111-1111-4111-8111-111111111111',
      phase: 'labs-paused' as const,
    };
    await migrationPauseOperations(root, input, {
      github: () => '',
      wrangler: () => Promise.resolve('[]'),
      guard: () => undefined,
    }).write(record);
    const commands: string[][] = [];
    const operations = migrationTransferOperations(root, input.slug, {
      github: (args) => {
        commands.push(args);
        return '';
      },
      guard: () => undefined,
    });

    await operations.guard();
    await operations.journal('prepared', record);
    await operations.setDestinationOwner(true);
    await operations.dispatch(record.destinationCommit);

    expect(commands).toEqual([
      ['variable', 'set', 'LVBT_DEPLOYMENT_OWNER', '--body', 'true', '--repo', input.repository],
      [
        'workflow',
        'run',
        'deploy.yml',
        '--repo',
        input.repository,
        '--ref',
        'main',
        '--field',
        `commit=${record.destinationCommit}`,
      ],
    ]);
    expect(await readFile(path.join(root, '.wrangler/migrations/example.jsonl'), 'utf8')).toContain(
      '"phase":"prepared"',
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
