import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { expectNoAccessibilityViolations } from '@lasvegasfortransit/playwright-config/accessibility';
import { monitorPageHealth } from '@lasvegasfortransit/playwright-config/page-health';

test('runs the footer handoff under the Worker script policy', async ({ page }) => {
  const headers = await readFile(new URL('../../public/_headers', import.meta.url), 'utf8');
  const policy = /^ {2}Content-Security-Policy: (.+)$/m.exec(headers)?.[1];
  if (!policy) throw new Error('The home Worker has no Content Security Policy.');
  await page.setViewportSize({ width: 1440, height: 900 });
  const health = monitorPageHealth(page);
  await page.route('**/', async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      headers: {
        ...response.headers(),
        'content-security-policy': policy,
      },
    });
  });
  await page.goto('/');
  await page.keyboard.press('Tab');
  await expectNoAccessibilityViolations(page);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect(page.locator('.brand')).toHaveAttribute('inert', '');
  health.assertNoErrors();
});
