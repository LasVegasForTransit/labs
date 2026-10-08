import { expect, test } from 'vitest';
import * as policy from '../src/release-policy.js';

test('draft publication is withheld while explicit draft preview remains available', () => {
  expect(() =>
    policy.assertLabReleasePolicy(
      { slug: 'transit-funding', status: 'draft' },
      {
        target: 'preview',
        event: 'workflow_dispatch',
        standalone: false,
      },
    ),
  ).not.toThrow();
  for (const request of [
    { target: 'preview' as const, event: 'push' },
    { target: 'production' as const, event: 'workflow_dispatch' },
  ])
    expect(() =>
      policy.assertLabReleasePolicy(
        { slug: 'transit-funding', status: 'draft' },
        {
          ...request,
          standalone: false,
        },
      ),
    ).toThrow(/draft/);
});

test('published source permits retained staging and explicit production promotion', () => {
  for (const status of ['active', 'deprecated'] as const) {
    expect(() =>
      policy.assertLabReleasePolicy(
        { slug: 'home', status },
        {
          target: 'preview',
          event: 'push',
          standalone: false,
        },
      ),
    ).not.toThrow();
    expect(() =>
      policy.assertLabReleasePolicy(
        { slug: 'home', status },
        {
          target: 'production',
          event: 'workflow_dispatch',
          standalone: false,
        },
      ),
    ).not.toThrow();
    expect(() =>
      policy.assertLabReleasePolicy(
        { slug: 'home', status },
        {
          target: 'production',
          event: 'push',
          standalone: false,
        },
      ),
    ).toThrow(/explicit/);
  }
});

test('retired, graduated and standalone-owned projects never enter the live source release route', () => {
  for (const target of ['preview', 'production'] as const) {
    for (const status of ['retired', 'graduated'] as const) {
      expect(() =>
        policy.assertLabReleasePolicy(
          { slug: 'home', status },
          {
            target,
            event: 'workflow_dispatch',
            standalone: false,
          },
        ),
      ).toThrow(/archive|graduate/);
    }
    expect(() =>
      policy.assertLabReleasePolicy(
        { slug: 'home', status: 'active' },
        {
          target,
          event: 'workflow_dispatch',
          standalone: true,
        },
      ),
    ).toThrow(/standalone/);
  }
});

test('promotion evaluates the retained source lifecycle even after the working tree publishes the draft', async () => {
  const { mkdtemp, mkdir, readFile, rm, writeFile } = await import('node:fs/promises');
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const { fileURLToPath } = await import('node:url');
  const os = await import('node:os');
  const path = await import('node:path');
  const root = fileURLToPath(new URL('../../../', import.meta.url));
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'lvbt-retained-policy-'));
  const run = promisify(execFile);
  try {
    const { stdout } = await run('git', ['rev-parse', 'HEAD'], { cwd: root });
    await run('git', ['clone', '--local', '--no-checkout', root, temporary]);
    await mkdir(path.join(temporary, '.lvbt'), { recursive: true });
    await mkdir(path.join(temporary, 'apps/transit-funding'), { recursive: true });
    await writeFile(
      path.join(temporary, '.lvbt/tooling.json'),
      JSON.stringify({
        release: {
          apps: {
            'transit-funding': {
              appDirectory: 'deploy/transit-funding',
              artifactPrefix: 'funding-release',
            },
          },
        },
      }),
    );
    const draft = await readFile(path.join(root, 'apps/transit-funding/lab.config.ts'), 'utf8');
    await writeFile(
      path.join(temporary, 'apps/transit-funding/lab.config.ts'),
      draft.replace("status: 'draft'", "status: 'active'"),
    );
    await expect(
      policy.selectLabReleases(temporary, {
        app: 'transit-funding',
        target: 'production',
        event: 'workflow_dispatch',
        commit: stdout.trim(),
      }),
    ).rejects.toThrow(/draft/);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test('current graduated ownership blocks promotion of an older active source release', async () => {
  const { mkdtemp, mkdir, readFile, rm, writeFile } = await import('node:fs/promises');
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const { fileURLToPath } = await import('node:url');
  const os = await import('node:os');
  const path = await import('node:path');
  const root = fileURLToPath(new URL('../../../', import.meta.url));
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'lvbt-current-owner-'));
  const run = promisify(execFile);
  try {
    const { stdout } = await run('git', ['rev-parse', 'HEAD'], { cwd: root });
    await run('git', ['clone', '--local', '--no-checkout', root, temporary]);
    await mkdir(path.join(temporary, '.lvbt'), { recursive: true });
    await mkdir(path.join(temporary, 'apps/home'), { recursive: true });
    await writeFile(
      path.join(temporary, '.lvbt/tooling.json'),
      JSON.stringify({
        release: {
          apps: {
            home: { appDirectory: 'deploy/home', artifactPrefix: 'home-release' },
          },
        },
      }),
    );
    const active = await readFile(path.join(root, 'apps/home/lab.config.ts'), 'utf8');
    await writeFile(
      path.join(temporary, 'apps/home/lab.config.ts'),
      active.replace("status: 'active'", "status: 'graduated'"),
    );
    await expect(
      policy.selectLabReleases(temporary, {
        app: 'home',
        target: 'production',
        event: 'workflow_dispatch',
        commit: stdout.trim(),
      }),
    ).rejects.toThrow();
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
