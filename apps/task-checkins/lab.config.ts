export default {
  manifestVersion: 1,
  slug: 'task-checkins',
  title: 'Discord task updates',
  summary: 'Update Notion tasks and coordinate project work from Discord.',
  kind: 'tool',
  profile: 'app',
  status: 'draft',
  visibility: 'unlisted',
  maintainers: ['williecubed'],
  dates: {
    created: '2026-10-23',
  },
  previewImage: {
    path: 'public/preview.svg',
    alt: 'Discord task updates for Las Vegans for Better Transit.',
  },
  licenses: {
    code: 'MIT',
    content: 'CC-BY-4.0',
    data: 'LicenseRef-Private-LVBT',
    assets: 'MIT',
  },
} as const;
