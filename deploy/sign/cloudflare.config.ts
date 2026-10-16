import { bindings, defineConfig } from 'cf/config';

export default defineConfig(({ isPreview }) => ({
  accountId: '2557b5c2e166292ded0f8425b73075e9',
  worker: {
    name: isPreview ? 'lvbt-labs-sign-staging' : 'lvbt-labs-sign',
    entrypoint: './worker.ts',
    env: { ASSETS: bindings.assets() },
    compatibilityDate: '2026-08-31',
    previewUrls: false,
    assets: { notFoundHandling: 'none' },
    domains: isPreview ? [] : ['sign.lasvegasfortransit.org'],
  },
}));
