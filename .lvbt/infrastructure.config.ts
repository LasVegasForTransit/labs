export default {
  repository: 'LasVegasForTransit/labs',
  branch: 'main',
  environment: 'production',
  preview: {
    environment: 'preview',
    secret: 'CLOUDFLARE_PREVIEW_API_TOKEN',
    enabledVariable: 'CLOUDFLARE_PREVIEWS_ENABLED',
  },
  accountId: '2557b5c2e166292ded0f8425b73075e9',
  zoneId: '7f5c9050d47580145fc50b71def46aaf',
  zoneName: 'lasvegasfortransit.org',
  hostname: 'labs.lasvegasfortransit.org',
};
