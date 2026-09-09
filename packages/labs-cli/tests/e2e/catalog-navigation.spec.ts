import { expect, test } from '@playwright/test';

// The shared preview owns routing between labs: exact slug paths go to the
// owning lab and everything else goes to home, the way production does.

test('the root of the shared origin is the catalog', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('LVBT Labs');
  await expect(page.getByRole('heading', { level: 1, name: 'LVBT Labs' })).toBeVisible();
});

test('a lab slug is served by the lab that owns it', async ({ page }) => {
  await page.goto('/transit-funding/');
  await expect(page).toHaveURL('/transit-funding/');
  await expect(page).toHaveTitle('What it would take to fund transit in Southern Nevada');
  await expect(page.getByRole('heading', { level: 1, name: 'One sentence' })).toBeVisible();
});
