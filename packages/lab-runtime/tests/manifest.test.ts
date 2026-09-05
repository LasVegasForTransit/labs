import { expect, test } from 'vitest';
import { LabManifestV1Schema, validateManifestForDirectory } from '../src/manifest.js';

const manifest = {
  manifestVersion: 1,
  slug: 'regional-map',
  title: 'Regional Map',
  summary: 'Explore regional transit.',
  kind: 'tool',
  profile: 'app',
  status: 'active',
  visibility: 'listed',
  maintainers: ['maintainer'],
  dates: { created: '2026-08-01', published: '2026-09-01' },
  previewImage: { path: 'preview.png', alt: 'A transit map.' },
  licenses: { code: 'MIT', content: 'CC-BY-4.0', data: 'CC0-1.0', assets: 'CC-BY-4.0' },
};

test('validates the public manifest contract without a Labs checkout', () => {
  expect(LabManifestV1Schema.parse(manifest)).toEqual(manifest);
  expect(validateManifestForDirectory(manifest, 'regional-map')).toEqual(manifest);
  expect(() => validateManifestForDirectory(manifest, 'other-map')).toThrow(/directory/);
});

test.each(['deprecated', 'retired', 'graduated'])(
  'requires lifecycle metadata for %s',
  (status) => {
    expect(() => LabManifestV1Schema.parse({ ...manifest, status })).toThrow();
  },
);
