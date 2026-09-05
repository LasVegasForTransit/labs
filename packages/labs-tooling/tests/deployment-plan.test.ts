import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from 'vitest';

import { deploymentPlan } from '../src/deployment-plan.js';
import home from '../../../apps/home/lab.config.js';

function commit(
  root: string,
  files: Record<string, string>,
  parent?: string,
  removed: string[] = [],
): string {
  const changes =
    Object.entries(files)
      .map(
        ([file, content]) =>
          `M 100644 inline ${file}\ndata ${Buffer.byteLength(content)}\n${content}\n`,
      )
      .join('') + removed.map((file) => `D ${file}\n`).join('');
  execFileSync('git', ['fast-import', '--quiet'], {
    cwd: root,
    input: `commit refs/heads/main\ncommitter Test <test@example.org> 1788566400 +0000\ndata 4\ntest\n${parent === undefined ? '' : `from ${parent}\n`}${changes}\n`,
  });
  return execFileSync('git', ['rev-parse', 'main'], { cwd: root, encoding: 'utf8' }).trim();
}

const files = {
  'packages/brand/package.json': JSON.stringify({ name: '@lvbt/brand' }),
  'apps/home/package.json': JSON.stringify({
    name: '@lvbt/lab-home',
    dependencies: { '@lvbt/brand': 'workspace:*' },
  }),
  'apps/home/lab.config.ts': `export default ${JSON.stringify(home)} as const;`,
  'apps/map/package.json': JSON.stringify({
    name: '@lvbt/lab-map',
    dependencies: { '@lvbt/brand': 'workspace:*' },
  }),
  'apps/map/lab.config.ts': `export default ${JSON.stringify({ ...home, slug: 'map' })} as const;`,
};

test('plans from committed trees, resolving refs and rebuilding shared dependents', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'lab-deployment-plan-'));
  try {
    execFileSync('git', ['init', '--quiet'], { cwd: root });
    const base = commit(root, files);
    const head = commit(root, { 'packages/brand/src/tokens.css': ':root {}' }, base);
    const plan = deploymentPlan(root, { base, head: 'main' });
    expect(plan.base).toBe(base);
    expect(plan.head).toBe(head);
    expect(plan.deploy).toEqual(['map', 'home']);
    expect(plan.files).toEqual(['packages/brand/src/tokens.css']);
    expect(deploymentPlan(root, { head: 'main' }).apps).toEqual(['home', 'map']);
    expect(() => deploymentPlan(root, { base: 'missing', head: 'main' })).toThrow();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('does not execute historical manifests while inspecting their status', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'lab-deployment-plan-'));
  try {
    execFileSync('git', ['init', '--quiet'], { cwd: root });
    commit(root, {
      ...files,
      'apps/map/lab.config.ts': 'export default (() => { throw new Error("EXECUTED"); })();',
    });
    expect(() => deploymentPlan(root, { head: 'main' })).toThrow(/literal manifest/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('deploys retired archives after source removal without inventing a build package', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'lab-retired-plan-'));
  try {
    execFileSync('git', ['init', '--quiet'], { cwd: root });
    const base = commit(root, files);
    const manifest = {
      ...home,
      slug: 'map',
      status: 'retired',
      dates: { ...home.dates, retired: '2026-09-05' },
      lifecycle: { reason: 'Ended' },
    };
    const head = commit(
      root,
      {
        'catalog/map.json': JSON.stringify(manifest),
        'retired/map/site/index.html': '<h1>Archived map</h1>',
      },
      base,
      ['apps/map'],
    );
    const plan = deploymentPlan(root, { base, head });
    expect(plan.deploy).toEqual(['map', 'home']);
    expect(plan.packages).not.toContain('@lvbt/lab-map');
    const update = commit(root, { 'retired/map/site/index.html': '<h1>Corrected map</h1>' }, head);
    expect(deploymentPlan(root, { base: head, head: update }).deploy).toEqual(['map', 'home']);
    const docs = commit(root, { 'docs/guide.md': 'Updated guide' }, update);
    expect(deploymentPlan(root, { base: update, head: docs }).deploy).toEqual([]);
    expect(deploymentPlan(root, { head: docs }).deploy).toEqual(['map', 'home']);
    const graduated = commit(
      root,
      {
        'catalog/map.json': JSON.stringify({
          ...manifest,
          status: 'graduated',
          dates: { ...manifest.dates, graduated: '2026-09-05' },
          sourceRepository: 'https://github.com/LasVegasForTransit/map',
        }),
      },
      docs,
    );
    expect(deploymentPlan(root, { base: docs, head: graduated }).deploy).toEqual(['home']);
    expect(deploymentPlan(root, { head: graduated }).deploy).toEqual(['home']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('deploys the archive before removing retired project source', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'lab-retirement-handoff-'));
  try {
    execFileSync('git', ['init', '--quiet'], { cwd: root });
    const base = commit(root, {
      ...files,
      'packages/labs-tooling/package.json': JSON.stringify({ name: '@lvbt/labs-tooling' }),
    });
    const manifest = {
      ...home,
      slug: 'map',
      status: 'retired',
      dates: { ...home.dates, retired: '2026-09-05' },
      lifecycle: { reason: 'Ended' },
    };
    const head = commit(
      root,
      {
        'apps/map/lab.config.ts': `export default ${JSON.stringify(manifest)} as const;`,
        'retired/map/site/index.html': '<h1>Archived map</h1>',
      },
      base,
    );
    const plan = deploymentPlan(root, { base, head });
    expect(plan.deploy).toEqual(['map', 'home']);
    expect(plan.packages).not.toContain('@lvbt/lab-map');
    const update = commit(
      root,
      { 'retired/map/site/index.html': '<h1>Updated archive</h1>' },
      head,
    );
    expect(deploymentPlan(root, { base: head, head: update }).deploy).toEqual(['map', 'home']);
    const runtime = commit(
      root,
      { 'packages/labs-tooling/src/archive-worker.ts': '// Updated' },
      update,
    );
    expect(deploymentPlan(root, { base: update, head: runtime }).deploy).toEqual(['map']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
