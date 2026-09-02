import { expect, test } from '@playwright/test';

test('loads at its permanent Labs path with static metadata', async ({ page }) => {
  await page.goto('/transit-funding/');

  await expect(page).toHaveTitle('What it would take to fund transit in Southern Nevada');
  await expect(page.getByRole('link', { name: 'LVBT Labs home' })).toHaveAttribute('href', '/');
  await expect(page.getByRole('heading', { level: 1, name: 'One sentence' })).toBeVisible();
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    'https://labs.lasvegasfortransit.org/transit-funding/',
  );
});

test('restores the app shell beneath its permanent path', async ({ page }) => {
  await page.goto('/transit-funding/explore');

  await expect(page.getByRole('heading', { level: 1, name: 'One sentence' })).toBeVisible();
});
