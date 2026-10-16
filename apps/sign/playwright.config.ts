import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.ts',
  workers: 2,
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    { name: 'webkit', use: { browserName: 'webkit' } },
  ],
  use: { baseURL: 'http://127.0.0.1:4330', trace: 'off' },
  webServer: {
    command: 'node scripts/build.mjs && node scripts/serve.mjs',
    url: 'http://127.0.0.1:4330',
    reuseExistingServer: !process.env.CI,
  },
});
