import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from 'vitest';
import home from '../../../apps/home/lab.config.js';
import draft from '../../../apps/transit-funding/lab.config.js';
import { selectLabPrReleases } from '../src/pr-release-policy.js';

async function fixture(run: (root: string) => Promise<void>) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'labs-pr-release-policy-'));
  try {
    await mkdir(path.join(root, '.lvbt'));
    const apps: Record<string, unknown> = {};
    for (const manifest of [home, draft]) {
      await mkdir(path.join(root, 'apps', manifest.slug), { recursive: true });
      await writeFile(
        path.join(root, 'apps', manifest.slug, 'lab.config.ts'),
        `export default ${JSON.stringify(manifest)};`,
      );
      apps[manifest.slug] = {
        appDirectory: `deploy/${manifest.slug}`,
        artifactPrefix: `${manifest.slug}-release`,
      };
    }
    await writeFile(path.join(root, '.lvbt/tooling.json'), JSON.stringify({ release: { apps } }));
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
test('PR product selection keeps affected published profiles, excludes drafts, and returns no work for unaffected changes', async () => {
  await fixture(async (root) => {
    const input = { action: 'synchronize', base: 'a'.repeat(40), head: 'b'.repeat(40) };
    const plan = () => ({ deploy: ['home'], head: input.head });
    expect((await selectLabPrReleases(root, input, plan)).map((item) => item.app)).toEqual([
      'home',
    ]);
    expect(
      await selectLabPrReleases(root, input, () => ({ deploy: [], head: input.head })),
    ).toEqual([]);
    await expect(
      selectLabPrReleases(root, input, () => ({ deploy: ['new-project'], head: input.head })),
    ).rejects.toThrow(/declared/);
  });
});
test('closed PR cleanup selects only reviewed declared namespaces without reading provider state or publishing drafts', async () => {
  await fixture(async (root) => {
    const plan = () => {
      throw new Error('No build or affected diff during cleanup');
    };
    expect(
      (await selectLabPrReleases(root, { action: 'closed' }, plan)).map((item) => item.app),
    ).toEqual(['home', 'transit-funding']);
  });
});
