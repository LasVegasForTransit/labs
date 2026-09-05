export function archiveTemplate(): Record<string, string> {
  return {
    'playwright.archive.config.ts': `import { defineConfig } from '@playwright/test';
import { sharedConfig } from '@lvbt/playwright-config';

export default defineConfig({
  ...sharedConfig,
  testDir: './tests/e2e/archive',
  outputDir: './test-results/archive',
});
`,
    'tests/e2e/archive/read-only.spec.ts': `import { expect, test } from '@playwright/test';
import { createArchiveContext, readArchiveFiles } from '@lvbt/labs-tooling/archive';
import manifest from '../../../lab.config';

test('reads the archived project without live services', async ({ browser, viewport }, testInfo) => {
  const archive = await createArchiveContext(browser, {
    slug: manifest.slug,
    files: await readArchiveFiles('dist-archive'),
    viewport: viewport ?? undefined,
  });
  try {
    const page = await archive.context.newPage();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(archive.origin + '/' + manifest.slug + '/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(manifest.title);
    await expect(page.getByText(manifest.summary, { exact: true })).toBeVisible();
    await expect(page.locator('form, input, textarea, [contenteditable="true"]')).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(manifest.title);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('archive.png'), fullPage: true });
    expect(archive.failures).toEqual([]);
  } finally {
    await archive.context.close();
  }
});
`,
  };
}
