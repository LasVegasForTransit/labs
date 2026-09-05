import { expect, test } from '@playwright/test';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createTestHarness } from 'wrangler';
import home from '../../../../apps/home/lab.config.js';
import { storeRetirementArchive } from '../../src/archive-store.js';
import { prepareArchiveWorker } from '../../src/archive-worker.js';
import { LabManifestV1Schema } from '../../src/manifest.js';

test('archive Worker serves captured pages without app code or write bindings', async ({
  page,
}) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'lvbt-archive-worker-'));
  const server = createTestHarness();
  try {
    const source = path.join(root, 'build');
    await mkdir(path.join(source, 'sources'), { recursive: true });
    await writeFile(
      path.join(source, 'index.html'),
      '<h1>Archived map</h1><a href="sources">Sources</a>',
    );
    await writeFile(path.join(source, 'sources/index.html'), '<h1>Sources</h1>');
    await writeFile(path.join(source, '_redirects'), '/* https://example.com 302');
    await writeFile(path.join(source, '_headers'), '/*\n  X-Archived-Rule: should-not-apply');
    const manifest = LabManifestV1Schema.parse({
      ...home,
      slug: 'old-map',
      status: 'retired',
      dates: { ...home.dates, retired: '2026-09-05' },
      lifecycle: { reason: 'The project ended.' },
    });
    const stored = await storeRetirementArchive(
      root,
      {
        manifest,
        sourceCommit: 'a'.repeat(40),
        sourceRepository: 'https://github.com/LasVegasForTransit/labs',
      },
      source,
      () => Promise.resolve(),
    );
    const bundle = await prepareArchiveWorker(stored.directory, path.join(root, 'worker'));
    await rm(source, { recursive: true });
    await server.update({ workers: [{ configPath: bundle.config }] });
    const { url } = await server.listen();
    expect(Object.keys(await server.getWorker().getEnv())).toEqual(['ASSETS']);
    const response = await page.goto(new URL('/old-map', url).href);
    await expect(page).toHaveURL(new URL('/old-map/', url).href);
    expect(response?.headers()['x-archived-rule']).toBeUndefined();
    await expect(page.getByRole('heading')).toHaveText('Archived map');
    await page.getByRole('link', { name: 'Sources' }).click();
    await page.reload();
    await expect(page.getByRole('heading')).toHaveText('Sources');
    expect((await server.fetch('/old-map/', { method: 'POST', body: 'write' })).status).toBe(405);
    expect((await server.fetch('/old-mapper/')).status).toBe(404);
    expect((await server.fetch('/old-map/api/live')).status).toBe(404);
    expect((await server.fetch('/old-map')).status).toBe(200);
    expect(await (await server.fetch('/old-map/', { method: 'HEAD' })).text()).toBe('');
  } finally {
    await server.close();
    await rm(root, { recursive: true, force: true });
  }
});
