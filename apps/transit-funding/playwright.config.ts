import { defineConfig } from '@playwright/test';

import { sharedConfig } from '@lasvegasfortransit/playwright-config';

const url = 'http://127.0.0.1:4331';

export default defineConfig({
  ...sharedConfig,
  testIgnore: ['**/archive/**'],
  use: { ...sharedConfig.use, baseURL: url },
  webServer: {
    command: 'pnpm preview',
    url: `${url}/transit-funding/`,
    reuseExistingServer: !process.env.CI,
  },
});
