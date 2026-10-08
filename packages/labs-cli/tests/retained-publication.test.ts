import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from 'vitest';
import { publishRetainedLab } from '../src/retained-publication.js';
import home from '../../../apps/home/lab.config.js';

async function fixture(status = 'active') {
  const root = await mkdtemp(path.join(os.tmpdir(), 'labs-retained-publish-'));
  await mkdir(path.join(root, '.lvbt'));
  await mkdir(path.join(root, 'apps/home'), { recursive: true });
  await writeFile(
    path.join(root, 'apps/home/lab.config.ts'),
    `export default ${JSON.stringify({ ...home, status })} as const;`,
  );
  await writeFile(
    path.join(root, '.lvbt/tooling.json'),
    JSON.stringify({
      release: {
        repository: 'LasVegasForTransit/labs',
        apps: { home: { appDirectory: 'deploy/home', artifactPrefix: 'home-release' } },
      },
    }),
  );
  return root;
}
const input = {
  app: 'home',
  runId: '123',
  expectedVersion: '1c4deaba-ee53-4c3f-ba65-176ae596cad5',
  commit: 'a'.repeat(40),
  reason: 'Restore reviewed release',
  apply: true,
};

test('selects retained bytes and forwards the optimistic version guard without any rebuild or provider command', async () => {
  const root = await fixture();
  const commands: string[][] = [];
  try {
    const result = await publishRetainedLab(root, input, {
      async run(args) {
        await Promise.resolve();
        commands.push(args);
        if (args[0] === 'gh') return JSON.stringify({ head_sha: input.commit });
        return 'Published retained release; live marker verified.';
      },
    });
    expect(result).toMatchObject({ ok: true, changed: true, app: 'home', runId: '123' });
    expect(commands).toEqual([
      ['gh', 'api', 'repos/LasVegasForTransit/labs/actions/runs/123'],
      [
        'pnpm',
        'exec',
        'lvbt',
        'promote',
        '--app',
        'home',
        '--run-id',
        '123',
        '--expected-version',
        input.expectedVersion,
      ],
    ]);
    if (!result.journal) throw new Error('Publication journal missing');
    expect(await readFile(result.journal, 'utf8')).toContain('verified');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test.each(['draft', 'graduated'])(
  'withholds publication for %s lifecycle before any external command',
  async (status) => {
    const root = await fixture(status);
    let calls = 0;
    try {
      await expect(
        publishRetainedLab(root, input, {
          run: async () => {
            await Promise.resolve();
            calls++;
            return '';
          },
        }),
      ).rejects.toThrow();
      expect(calls).toBe(0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);

test('dry-run and wrong retained source never dispatch promotion', async () => {
  const root = await fixture();
  const commands: string[][] = [];
  const dependencies = {
    run: async (args: string[]) => {
      await Promise.resolve();
      commands.push(args);
      return JSON.stringify({ head_sha: 'b'.repeat(40) });
    },
  };
  try {
    expect((await publishRetainedLab(root, { ...input, apply: false }, dependencies)).changed).toBe(
      false,
    );
    expect(commands).toEqual([]);
    await expect(publishRetainedLab(root, input, dependencies)).rejects.toThrow(/retained source/);
    expect(commands).toHaveLength(1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('a lost promotion response records uncertainty and never redispatches', async () => {
  const root = await fixture();
  let dispatches = 0;
  try {
    const result = await publishRetainedLab(root, input, {
      run: async (args) => {
        await Promise.resolve();
        if (args[0] === 'gh') return JSON.stringify({ head_sha: input.commit });
        dispatches++;
        throw new Error('Inspect promotion 456; do not redispatch.');
      },
    });
    expect(result).toMatchObject({ ok: false, changed: null });
    expect(dispatches).toBe(1);
    if (!result.journal) throw new Error('Publication journal missing');
    expect(await readFile(result.journal, 'utf8')).toContain('unconfirmed');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('paused migration recovery requires its captured source run and verified disabled destination ownership', async () => {
  const root = await fixture();
  let dispatches = 0;
  const handoff = {
    formatVersion: 1,
    slug: 'home',
    repository: 'Example/standalone',
    sourceCommit: 'b'.repeat(40),
    destinationCommit: 'c'.repeat(40),
    previousVersion: input.expectedVersion,
    previousRelease: { commit: input.commit, releaseId: input.runId },
    phase: 'labs-paused',
  };
  const dependencies = {
    destinationOwner: () => Promise.resolve('true'),
    run: (args: string[]) => {
      if (args[0] === 'gh') return Promise.resolve(JSON.stringify({ head_sha: input.commit }));
      dispatches++;
      return Promise.resolve('Verified shared publication receipt');
    },
  };
  try {
    await mkdir(path.join(root, 'migrations'));
    await writeFile(path.join(root, 'migrations/home.json'), JSON.stringify(handoff));
    await expect(publishRetainedLab(root, input, dependencies)).rejects.toThrow(/Disable/);
    expect(dispatches).toBe(0);
    dependencies.destinationOwner = () => Promise.resolve('false');
    await expect(
      publishRetainedLab(root, { ...input, runId: '124' }, dependencies),
    ).rejects.toThrow(/verified retained run/);
    expect(dispatches).toBe(0);
    expect(await publishRetainedLab(root, input, dependencies)).toMatchObject({
      ok: true,
      changed: true,
    });
    expect(dispatches).toBe(1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
