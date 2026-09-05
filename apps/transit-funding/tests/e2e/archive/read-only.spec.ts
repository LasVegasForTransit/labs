import { expect, test } from '@playwright/test';
import { createArchiveContext, readProjectArchiveFiles } from '@lvbt/labs-tooling/archive';

test('reads the funding story with all live services unavailable', async ({
  browser,
  viewport,
}, testInfo) => {
  const archive = await createArchiveContext(browser, {
    slug: 'transit-funding',
    files: await readProjectArchiveFiles(),
    viewport: viewport ?? undefined,
  });
  try {
    const page = await archive.context.newPage();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(`${archive.origin}/transit-funding/`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('One sentence');
    const chart = page.locator('svg[role="img"]');
    await expect(chart).toBeVisible();
    const initialDescription = await chart.getAttribute('aria-label');
    for (const title of ['What it holds back', 'Strike it']) {
      const heading = page.getByRole('heading', { name: title, exact: true });
      await heading.scrollIntoViewIfNeeded();
      await expect(heading).toBeVisible();
    }
    await expect(chart).not.toHaveAttribute('aria-label', initialDescription ?? '');
    await expect(page.locator('form, input, textarea, [contenteditable="true"]')).toHaveCount(0);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.reload();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.getByRole('link', { name: 'LVBT Labs home' }).focus();
    await expect(page.getByRole('link', { name: 'LVBT Labs home' })).toBeFocused();
    await page.screenshot({ path: testInfo.outputPath('archive.png'), fullPage: true });
    expect(archive.failures).toEqual([]);
  } finally {
    await archive.context.close();
  }
});
