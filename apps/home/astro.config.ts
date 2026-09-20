import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import { labsAnalytics } from '@lvbt/brand/analytics/astro';
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://labs.lasvegasfortransit.org',
  output: 'static',
  integrations: [sitemap(), labsAnalytics()],
  vite: {
    plugins: [tailwindcss()],
  },
});
