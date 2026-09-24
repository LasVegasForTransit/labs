import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import lvbtAnalytics from '@lasvegasfortransit/analytics/astro';
import { LABS_SITE } from '@lvbt/brand/analytics';
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://labs.lasvegasfortransit.org',
  output: 'static',
  integrations: [sitemap(), lvbtAnalytics({ site: LABS_SITE })],
  vite: {
    plugins: [tailwindcss()],
  },
});
