import { describe, expect, it } from 'vitest';

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  discoverLabs,
  LabManifestV1Schema,
  validateManifestForDirectory,
} from '../src/manifest.js';

const activeManifest = {
  manifestVersion: 1,
  slug: 'transit-funding',
  title: 'Transit Funding',
  summary: 'Explore how Southern Nevada funds transit and what better service costs.',
  kind: 'visualization',
  profile: 'app',
  status: 'active',
  visibility: 'listed',
  maintainers: ['williecubed'],
  dates: {
    created: '2026-08-31',
    published: '2026-08-31',
  },
  previewImage: {
    path: 'public/preview.png',
    alt: 'Transit funding sources arranged beside the service they support.',
  },
  licenses: {
    code: 'MIT',
    content: 'CC-BY-4.0',
    data: 'LicenseRef-Mixed-Public-Data',
    assets: 'LicenseRef-LVBT-Brand',
  },
} as const;

describe('LabManifestV1Schema', () => {
  it('accepts a complete active manifest', () => {
    expect(LabManifestV1Schema.parse(activeManifest)).toEqual(activeManifest);
  });

  it('requires a publication date for an active manifest', () => {
    const manifest = {
      ...activeManifest,
      dates: { created: activeManifest.dates.created },
    };

    expect(() => LabManifestV1Schema.parse(manifest)).toThrow(/published/i);
  });

  it('requires deprecation details for a deprecated manifest', () => {
    const manifest = {
      ...activeManifest,
      status: 'deprecated',
      dates: {
        ...activeManifest.dates,
        deprecated: '2026-08-31',
      },
    };

    expect(() => LabManifestV1Schema.parse(manifest)).toThrow(/lifecycle/i);
  });

  it('accepts numeric characters in GitHub maintainer names', () => {
    const manifest = { ...activeManifest, maintainers: ['123-maintainer'] };

    expect(LabManifestV1Schema.parse(manifest).maintainers).toEqual(['123-maintainer']);
  });
});

describe('validateManifestForDirectory', () => {
  it('rejects a manifest whose slug differs from its app directory', () => {
    expect(() => validateManifestForDirectory(activeManifest, 'funding')).toThrow(
      /must match its app directory/i,
    );
  });
});

describe('discoverLabs', () => {
  it('loads every active app manifest in slug order', async () => {
    const root = path.resolve(fileURLToPath(new URL('../../..', import.meta.url)));
    const manifests = await discoverLabs(root);

    expect(manifests.map((manifest) => manifest.slug)).toEqual(['home', 'transit-funding']);
  });
});
