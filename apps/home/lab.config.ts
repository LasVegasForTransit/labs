export default {
  manifestVersion: 1,
  slug: 'home',
  title: 'LVBT Labs',
  summary: 'Urbanist technology experiments, practical tools, visualizations, and publications.',
  kind: 'publication',
  profile: 'site',
  status: 'active',
  visibility: 'listed',
  maintainers: ['williecubed'],
  dates: {
    created: '2026-08-31',
    published: '2026-08-31',
  },
  previewImage: {
    path: 'public/preview.png',
    alt: 'LVBT Labs wordmark on the organization paper and ember palette.',
  },
  licenses: {
    code: 'MIT',
    content: 'CC-BY-4.0',
    data: 'CC0-1.0',
    assets: 'LicenseRef-LVBT-Brand',
  },
} as const;
