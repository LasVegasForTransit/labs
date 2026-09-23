import { defineConfig } from '@playwright/test';
import { sharedConfig } from '@lasvegasfortransit/playwright-config';

export default defineConfig({
  ...sharedConfig,
  testDir: './tests/e2e/archive',
  outputDir: './test-results/archive',
});
