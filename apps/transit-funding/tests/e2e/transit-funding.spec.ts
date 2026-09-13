import { expect, test } from '@playwright/test';
import { expectNoAccessibilityViolations } from '@lvbt/playwright-config/accessibility';
import { monitorPageHealth } from '@lvbt/playwright-config/page-health';

test('loads at its permanent Labs path with static metadata', async ({ page }) => {
  const health = monitorPageHealth(page);
  await page.goto('/transit-funding/');

  await expect(page).toHaveTitle('What it would take to fund transit in Southern Nevada');
  await expect(page.getByRole('link', { name: 'LVBT Labs home' })).toHaveAttribute('href', '/');
  await expect(page.getByRole('heading', { level: 1, name: 'One sentence' })).toBeVisible();
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    'https://labs.lasvegasfortransit.org/transit-funding/',
  );
  await expectNoAccessibilityViolations(page);
  health.assertNoErrors();
});

test('matches the publication visual baseline', async ({ page }) => {
  const health = monitorPageHealth(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/transit-funding/');
  await page.evaluate(() => document.fonts.ready);

  await expect(page).toHaveScreenshot('introduction.png', {
    animations: 'disabled',
    fullPage: true,
  });
  health.assertNoErrors();
});

test('restores the app shell beneath its permanent path', async ({ page }) => {
  const health = monitorPageHealth(page);
  await page.goto('/transit-funding/explore');

  await expect(page.getByRole('heading', { level: 1, name: 'One sentence' })).toBeVisible();
  health.assertNoErrors();
});
