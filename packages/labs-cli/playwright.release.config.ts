import { defineConfig } from '@playwright/test';
import { sharedConfig } from '@lasvegasfortransit/playwright-config';

if (!process.env.PLAYWRIGHT_BASE_URL)
  throw new Error('Retained release acceptance requires its uploaded candidate origin.');
export default defineConfig({
  ...sharedConfig,
  testDir: './tests/e2e/release',
  use: { ...sharedConfig.use, baseURL: process.env.PLAYWRIGHT_BASE_URL, serviceWorkers: 'block' },
});
