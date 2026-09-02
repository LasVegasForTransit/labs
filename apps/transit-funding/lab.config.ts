export default {
  manifestVersion: 1,
  slug: 'transit-funding',
  title: 'Transit Funding',
  summary: 'See where transit money comes from, what it pays for, and what better service costs.',
  kind: 'visualization',
  profile: 'app',
  status: 'active',
  visibility: 'unlisted',
  maintainers: ['williecubed'],
  dates: {
    created: '2026-08-31',
    published: '2026-08-31',
  },
  previewImage: {
    path: 'public/transit-funding/preview.png',
    alt: 'Transit funding sources arranged beside the service they support.',
  },
  licenses: {
    code: 'MIT',
    content: 'CC-BY-4.0',
    data: 'LicenseRef-Mixed-Public-Data',
    assets: 'LicenseRef-LVBT-Brand',
  },
} as const;
