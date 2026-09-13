import { expect, test } from '@playwright/test';
import { expectNoAccessibilityViolations } from '@lvbt/playwright-config/accessibility';
import { monitorPageHealth } from '@lvbt/playwright-config/page-health';

test('matches the catalog visual baseline', async ({ page }) => {
  const health = monitorPageHealth(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.evaluate(() => document.fonts.ready);

  await expectNoAccessibilityViolations(page);
  await expect(page).toHaveScreenshot('catalog.png', {
    animations: 'disabled',
    fullPage: true,
  });
  health.assertNoErrors();
});
