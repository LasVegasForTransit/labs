import { expect, test } from '@playwright/test';
import { expectNoAccessibilityViolations } from '@lvbt/playwright-config/accessibility';

test('matches the catalog visual baseline', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.evaluate(() => document.fonts.ready);

  await expectNoAccessibilityViolations(page);
  await expect(page).toHaveScreenshot('catalog.png', {
    animations: 'disabled',
    fullPage: true,
  });
});
