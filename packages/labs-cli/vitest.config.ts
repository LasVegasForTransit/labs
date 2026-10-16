import { defineConfig } from 'vitest/config';

import { sharedConfig } from '@lasvegasfortransit/vitest-config';

export default defineConfig({
  ...sharedConfig,
  test: {
    ...sharedConfig.test,
    maxWorkers: 2,
    exclude: [...sharedConfig.test.exclude, 'tests/acceptance/**'],
  },
});
