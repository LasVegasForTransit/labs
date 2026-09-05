import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from 'vitest';
import { migrationPackages, migrationSource } from '../src/migration-source.js';

async function fixture(dependencies: Record<string, string>, run: (root: string) => void) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'lvbt-migration-source-'));
  try {
    execFileSync('git', ['init', '--quiet'], { cwd: root });
    const files = {
      'apps/map/package.json': JSON.stringify({ name: '@lvbt/lab-map', dependencies }),
      'apps/map/icon.bin': 'binary asset',
      'apps/other/package.json': JSON.stringify({ name: '@lvbt/lab-other' }),
      'packages/ui/package.json': JSON.stringify({
        name: '@lvbt/ui',
        dependencies: { '@lvbt/brand': 'workspace:*' },
      }),
      'packages/brand/package.json': JSON.stringify({ name: '@lvbt/brand' }),
      'packages/unused/package.json': JSON.stringify({ name: '@lvbt/unused' }),
    };
    let input =
      'commit refs/heads/fixture\ncommitter Test <test@example.org> 1 +0000\ndata 7\nfixture\n';
    for (const [name, content] of Object.entries(files))
      input += `M 100644 inline ${name}\ndata ${Buffer.byteLength(content)}\n${content}\n`;
    execFileSync('git', ['fast-import', '--quiet'], { cwd: root, input: `${input}\n` });
    execFileSync('git', ['symbolic-ref', 'HEAD', 'refs/heads/fixture'], { cwd: root });
    run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test('reads committed source and includes the transitive shared-package closure', async () => {
  await fixture({ '@lvbt/ui': 'workspace:*' }, (root) => {
    const source = migrationSource(root);
    expect(source.commit).toMatch(/^[a-f0-9]{40}$/);
    expect(source.read('apps/map/icon.bin').toString()).toBe('binary asset');
    expect(migrationPackages(source, 'map')).toEqual(['apps/map', 'packages/brand', 'packages/ui']);
  });
});

test.each([
  { '@lvbt/lab-other': 'workspace:*' },
  { '@lvbt/labs-tooling': 'workspace:*' },
  { outside: 'file:../../../outside' },
])('rejects nonportable dependencies: %j', async (dependencies) => {
  await fixture(dependencies, (root) => {
    expect(() => migrationPackages(migrationSource(root), 'map')).toThrow();
  });
});
