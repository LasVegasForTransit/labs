import { bindings, defineConfig, triggers } from 'cf/config';

export default defineConfig(({ isPreview }) => ({
  accountId: '2557b5c2e166292ded0f8425b73075e9',
  worker: {
    name: isPreview ? 'lvbt-labs-home-staging' : 'lvbt-labs-home',
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
      notFoundHandling: '404-page',
    },
    domains: isPreview ? [] : ['labs.lasvegasfortransit.org'],
    triggers: isPreview
      ? []
      : [
          triggers.fetch({
            pattern: 'labs.lasvegasfortransit.org/*',
            zone: 'lasvegasfortransit.org',
          }),
        ],
  },
}));
