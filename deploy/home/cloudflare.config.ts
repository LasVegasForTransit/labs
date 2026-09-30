import { defineConfig, triggers } from 'cf/config';

export default defineConfig({
  accountId: '2557b5c2e166292ded0f8425b73075e9',
  worker: {
    name: 'lvbt-labs-home',
    compatibilityDate: '2026-08-31',
    compatibilityFlags: ['nodejs_compat'],
    previewUrls: true,
    observability: {
      enabled: true,
      headSamplingRate: 1,
    },
    assets: {
      notFoundHandling: '404-page',
    },
    domains: ['labs.lasvegasfortransit.org'],
    triggers: [
      triggers.fetch({
        pattern: 'labs.lasvegasfortransit.org/*',
        zone: 'lasvegasfortransit.org',
      }),
    ],
  },
});
