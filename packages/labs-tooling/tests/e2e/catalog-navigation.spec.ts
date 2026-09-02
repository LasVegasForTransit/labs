import { expect, test } from '@playwright/test';

test('opens a lab from the catalog on the shared preview origin', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Explore transit funding' }).click();

  await expect(page).toHaveURL('/transit-funding/');
  await expect(page).toHaveTitle('What it would take to fund transit in Southern Nevada');
  await expect(page.getByRole('heading', { level: 1, name: 'One sentence' })).toBeVisible();
});
