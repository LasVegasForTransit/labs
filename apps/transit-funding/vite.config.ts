import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const environment = {
    ...loadEnv(mode, fileURLToPath(new URL('.', import.meta.url)), ''),
    ...process.env,
  };
  if (environment.LVBT_REQUIRE_ANALYTICS === '1' && !environment.PUBLIC_LVBT_CWA_TOKEN?.trim()) {
    throw new Error('PUBLIC_LVBT_CWA_TOKEN is required when LVBT_REQUIRE_ANALYTICS=1.');
  }

  return {
    base: '/',
    envPrefix: ['VITE_', 'PUBLIC_'],
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    build: {
      outDir: 'dist',
      assetsDir: 'transit-funding/assets',
      sourcemap: true,
    },
  };
});
