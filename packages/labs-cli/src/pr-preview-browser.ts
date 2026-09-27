import { chromium, type Page } from '@playwright/test';
import { expectNoAccessibilityViolations } from '@lasvegasfortransit/playwright-config/accessibility';
import { monitorPageHealth } from '@lasvegasfortransit/playwright-config/page-health';

async function assertKeyboardReachable(page: Page) {
  if (!(await page.locator('a[href], button, input, select, textarea, [tabindex]').count())) return;
  await page.keyboard.press('Tab');
  const focused = await page.evaluate<boolean>(
    'document.activeElement !== document.body && document.activeElement !== document.documentElement',
  );
  if (!focused) throw new Error('Preview has no keyboard-reachable control.');
}

export async function verifyPreviewBrowser(target: { slug: string }, receipt: { url: string }) {
  const path = target.slug === 'home' ? '/' : `/${target.slug}/`;
  const url = new URL(path, receipt.url).href;
  const browser = await chromium.launch();
  try {
    for (const viewport of [
      { width: 1280, height: 800 },
      { width: 390, height: 844 },
    ]) {
      const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
      try {
        const page = await context.newPage();
        const health = monitorPageHealth(page);
        const response = await page.goto(url, { waitUntil: 'load', timeout: 15000 });
        if (response?.status() !== 200)
          throw new Error(`Preview browser returned HTTP ${response?.status() ?? 'no response'}.`);
        const refreshed = await page.reload({ waitUntil: 'load', timeout: 15000 });
        if (refreshed?.status() !== 200)
          throw new Error(
            `Preview route refresh returned HTTP ${refreshed?.status() ?? 'no response'}.`,
          );
        await page.evaluate('document.fonts.ready');
        if ((await page.locator('script[src*="static.cloudflareinsights.com"]').count()) > 0)
          throw new Error('Preview browser loaded a Web Analytics beacon.');
        if (await page.evaluate<boolean>('document.documentElement.scrollWidth > innerWidth + 1'))
          throw new Error(`Preview overflows at ${viewport.width}px.`);
        await assertKeyboardReachable(page);
        await expectNoAccessibilityViolations(page);
        health.assertNoErrors();
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
}
