export function archiveTemplate(): Record<string, string> {
  return {
    'playwright.archive.config.ts': `import { defineConfig } from '@playwright/test';
import { sharedConfig } from '@lasvegasfortransit/playwright-config';

export default defineConfig({
  ...sharedConfig,
  testDir: './tests/e2e/archive',
  outputDir: './test-results/archive',
});
`,
    'tests/e2e/archive/read-only.spec.ts': `import { expect, test } from '@playwright/test';
import { createArchiveContext, readProjectArchiveFiles } from '@lvbt/lab-runtime/archive';
import { expectNoAccessibilityViolations } from '@lasvegasfortransit/playwright-config/accessibility';
import { monitorPageHealth } from '@lasvegasfortransit/playwright-config/page-health';
import manifest from '../../../lab.config';

test('reads the archived project without live services', async ({ browser, viewport }, testInfo) => {
  testInfo.snapshotSuffix = 'lvbt';
  const archive = await createArchiveContext(browser, {
    slug: manifest.slug,
    files: await readProjectArchiveFiles(),
    viewport: viewport ?? undefined,
  });
  try {
    const page = await archive.context.newPage();
    const health = monitorPageHealth(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(archive.origin + '/' + manifest.slug + '/');
    const heading = page.getByRole('heading', { level: 1 });
    const summary = page.getByText(manifest.summary, { exact: true });
    await expect(heading).toHaveText(manifest.title);
    await expect(summary).toBeVisible();
    await expect(page.locator('form, input, textarea, [contenteditable="true"]')).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(manifest.title);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expectNoAccessibilityViolations(page);
    await page.addStyleTag({ content: 'h1 { block-size: 3rem; overflow: hidden; } main > p { block-size: 3rem; overflow: hidden; }' });
    await expect(page).toHaveScreenshot('archive.png', {
      animations: 'disabled',
      fullPage: true,
      mask: [heading, summary],
      maskColor: '#e5471a',
    });
    health.assertNoErrors();
    expect(archive.failures).toEqual([]);
  } finally {
    await archive.context.close();
  }
});
`,
  };
}
