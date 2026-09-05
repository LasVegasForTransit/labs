import { defineConfig } from '@playwright/test';
import { sharedConfig } from '@lvbt/playwright-config';

export default defineConfig({
  ...sharedConfig,
  testDir: './tests/e2e/archive',
  outputDir: './test-results/archive',
});
