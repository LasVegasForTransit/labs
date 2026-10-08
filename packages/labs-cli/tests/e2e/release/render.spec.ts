import { expect, test as base } from '@playwright/test';
import { verifyStoredArchive } from '../../../src/archive-store.js';
import { archiveRoutes } from '../../../src/archive-browser.js';
import { assertArchiveProfile } from '../../../src/archive-release.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  accessCredentials,
  readReleaseConfiguration,
  scopeBrowserAccess,
  validateWorkerSmokeOrigin,
} from '@lasvegasfortransit/web-platform/release';
import { expectNoAccessibilityViolations } from '@lasvegasfortransit/playwright-config/accessibility';

const test = base.extend({
  context: async ({ context, baseURL }, use) => {
    if (!baseURL) throw new Error('Candidate origin is required; local fallback is prohibited.');
    const config = await readReleaseConfiguration(
      fileURLToPath(new URL('../../../../../', import.meta.url)),
    );
    const protectedCandidate = process.env.TARGET === 'preview';
    validateWorkerSmokeOrigin(baseURL, config, protectedCandidate);
    const credentials = protectedCandidate ? accessCredentials(process.env) : undefined;
    if (protectedCandidate && !credentials)
      throw new Error('Protected release requires Access credentials.');
    await scopeBrowserAccess(context, baseURL, credentials);
    await use(context);
    await context.unrouteAll({ behavior: 'wait' });
  },
});

test('retained candidate renders its declared Labs product without page errors', async ({
  page,
}) => {
  const app = process.env.LVBT_RELEASE_APP;
  if (!app) throw new Error('Select a declared Labs release app.');
  const root = fileURLToPath(new URL('../../../../../', import.meta.url));
  const config = await readReleaseConfiguration(root);
  const archive = config.appDirectory.startsWith('.wrangler/archive-releases/');
  if (archive) assertArchiveProfile(app, config);
  else if (app !== 'home' && app !== 'transit-funding')
    throw new Error('Select a declared source or archive release app.');
  const failures: string[] = [];
  const analyticsRequests: string[] = [];
  page.on('request', (request) => {
    const host = new URL(request.url()).hostname;
    if (host === 'cloudflareinsights.com' || host === 'events.lasvegasfortransit.org')
      analyticsRequests.push(request.url());
  });
  page.on('pageerror', (error) => failures.push(error.message));
  const response = await page.goto(config.publicPath ?? '/');
  expect(response?.status()).toBe(200);
  if (process.env.TARGET === 'preview')
    expect(response?.headers()['x-robots-tag']).toContain('noindex');
  if (archive) {
    const stored = await verifyStoredArchive(path.join(root, 'retired', app));
    for (const [route, content] of archiveRoutes(app, stored.site)) {
      if (!content.contentType.startsWith('text/html')) continue;
      expect((await page.goto(route))?.status()).toBe(200);
      await expect(page.locator('body')).toBeVisible();
      await expectNoAccessibilityViolations(page);
    }
  } else if (app === 'home') {
    await expect(page).toHaveTitle('LVBT Labs');
    await expect(page.getByRole('heading', { level: 1, name: 'LVBT Labs' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Projects' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Transit Funding' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Contribute', exact: true })).toBeVisible();
  } else {
    await expect(page).toHaveTitle('What it would take to fund transit in Southern Nevada');
    await expect(page.getByRole('heading', { level: 1, name: 'One sentence' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'LVBT Labs home' })).toHaveAttribute('href', '/');
    await page.goto('/transit-funding/explore');
    await expect(page.getByRole('heading', { level: 1, name: 'One sentence' })).toBeVisible();
  }
  await expectNoAccessibilityViolations(page);
  expect(failures).toEqual([]);
  // Production candidates and staging origins must not emit production analytics.
  expect(analyticsRequests).toEqual([]);
});
