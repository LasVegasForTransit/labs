import { expect, test } from '@playwright/test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import home from '../../../../apps/home/lab.config.js';
import { createArchiveContext, readArchiveFiles } from '../../src/archive-browser.js';
import { storeRetirementArchive, verifyStoredArchive } from '../../src/archive-store.js';
import { LabManifestV1Schema } from '../../src/manifest.js';
import { verifyRetiredArchives } from '../../src/retired-integrity.js';

for (const layout of ['root', 'prefixed']) {
  test(`stored ${layout} archive survives source removal and route refreshes`, async ({
    browser,
    viewport,
  }) => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'lvbt-archive-browser-'));
    const source = path.join(root, 'build');
    const site = layout === 'root' ? source : path.join(source, 'old-map');
    const manifest = LabManifestV1Schema.parse({
      ...home,
      slug: 'old-map',
      status: 'retired',
      dates: { ...home.dates, retired: '2026-09-05' },
      lifecycle: { reason: 'The project ended.' },
    });
    const verify = async (directory: string) => {
      const archive = await createArchiveContext(browser, {
        slug: manifest.slug,
        files: await readArchiveFiles(directory),
        viewport: viewport ?? undefined,
      });
      try {
        const page = await archive.context.newPage();
        await page.goto(`${archive.origin}/old-map/`);
        await expect(page.getByRole('heading')).toHaveText('Archived map');
        await page.getByRole('link', { name: 'Sources' }).click();
        await expect(page).toHaveURL(`${archive.origin}/old-map/sources/`);
        await expect(page.getByRole('heading')).toHaveText('Sources');
        await page.reload();
        await expect(page.getByRole('heading')).toHaveText('Sources');
        expect(archive.failures).toEqual([]);
      } finally {
        await archive.context.close();
      }
    };
    try {
      await mkdir(path.join(site, 'sources'), { recursive: true });
      await writeFile(
        path.join(site, 'index.html'),
        '<h1>Archived map</h1><a href="/old-map/sources/">Sources</a>',
      );
      await writeFile(path.join(site, 'sources/index.html'), '<h1>Sources</h1>');
      const identity = {
        manifest,
        sourceCommit: 'a'.repeat(40),
        sourceRepository: 'https://github.com/LasVegasForTransit/labs',
      };
      const stored = await storeRetirementArchive(root, identity, source, verify);
      expect(stored.changed).toBe(true);
      expect((await storeRetirementArchive(root, identity, source, verify)).changed).toBe(false);
      await rm(source, { recursive: true });
      await verify(path.join(stored.directory, 'site'));
      expect((await verifyStoredArchive(stored.directory)).manifest).toEqual(manifest);
      expect((await verifyRetiredArchives(root, [manifest])).get(manifest.slug)).toEqual(manifest);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
}
