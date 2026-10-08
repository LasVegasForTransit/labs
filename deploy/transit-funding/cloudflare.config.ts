import { bindings, defineConfig } from 'cf/config';

export default defineConfig(({ isPreview }) => ({
  accountId: '2557b5c2e166292ded0f8425b73075e9',
  worker: {
    name: isPreview ? 'lvbt-labs-transit-funding-staging' : 'lvbt-labs-transit-funding',
    entrypoint: './worker.ts',
    env: { ASSETS: bindings.assets() },
    compatibilityDate: '2026-08-31',
    compatibilityFlags: ['nodejs_compat'],
    previewUrls: true,
    observability: {
      enabled: true,
      headSamplingRate: 1,
    },
    assets: {
      runWorkerFirst: true,
      notFoundHandling: 'single-page-application',
    },
  },
}));
