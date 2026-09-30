import { defineConfig } from 'cf/config';

export default defineConfig({
  accountId: '2557b5c2e166292ded0f8425b73075e9',
  worker: {
    name: 'lvbt-labs-transit-funding',
    compatibilityDate: '2026-08-31',
    compatibilityFlags: ['nodejs_compat'],
    previewUrls: true,
    observability: {
      enabled: true,
      headSamplingRate: 1,
    },
    assets: {
      notFoundHandling: 'single-page-application',
    },
  },
});
