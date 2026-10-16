export default {
  manifestVersion: 1,
  slug: 'sign',
  title: 'Event Sign',
  summary: 'Hold up a readable LVBT sign so people can find your group at an event.',
  kind: 'tool',
  profile: 'app',
  status: 'active',
  visibility: 'unlisted',
  maintainers: ['williecubed'],
  dates: { created: '2026-10-15', published: '2026-10-15' },
  previewImage: {
    path: 'docs/reference/sign-tablet.png',
    alt: 'An orange LVBT sign with large black lettering on a tablet.',
  },
  licenses: {
    code: 'MIT',
    content: 'CC-BY-4.0',
    data: 'LicenseRef-No-External-Data',
    assets: 'LicenseRef-LVBT-Brand',
  },
} as const;
