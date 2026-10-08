import { defineConfig } from '@playwright/test';

import { sharedConfig } from '@lasvegasfortransit/playwright-config';

const url = 'http://127.0.0.1:8797';

export default defineConfig({
  ...sharedConfig,
  testIgnore: ['**/release/**'],
  use: { ...sharedConfig.use, baseURL: url },
  ...(process.env.LVBT_SKIP_PREVIEW_SERVER
    ? {}
    : {
        webServer: {
          command: 'pnpm -w preview',
          url: `${url}/`,
          reuseExistingServer: !process.env.CI,
        },
      }),
});
