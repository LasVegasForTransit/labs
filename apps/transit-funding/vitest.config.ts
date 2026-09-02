import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

import { sharedConfig } from '@lvbt/vitest-config';

export default defineConfig({
  ...sharedConfig,
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
