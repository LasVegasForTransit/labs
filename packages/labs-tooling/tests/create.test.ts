import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, test } from 'vitest';

import { createLab } from '../src/create.js';

const directories: string[] = [];

afterEach(async () => {
  for (const directory of directories.splice(0)) {
    await rm(directory, { recursive: true, force: true });
  }
});

test.each(['apps/example', 'retired/example', 'catalog/example.json'])(
  'rejects reserved slugs during dry run: %s',
  async (reserved) => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'lvbt-create-test-'));
    directories.push(root);
    await mkdir(path.join(root, reserved), { recursive: true });
    const manifest = path.join(root, 'input.json');
    await writeFile(
      manifest,
      JSON.stringify({
        manifestVersion: 1,
        slug: 'example',
        title: 'Example',
        summary: 'An unpublished project.',
        kind: 'publication',
        profile: 'site',
        status: 'draft',
        visibility: 'unlisted',
        maintainers: ['example'],
        dates: { created: '2026-09-04' },
        previewImage: { path: '/example/preview.png', alt: 'Example' },
        licenses: { code: 'MIT', content: 'CC0-1.0', data: 'CC0-1.0', assets: 'CC0-1.0' },
      }),
    );
    await expect(createLab(root, ['--manifest', manifest, '--dry-run'])).rejects.toThrow(
      'already reserved',
    );
  },
);
