import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { expect, test } from 'vitest';
import { preparePreviewBundle } from '../src/pr-preview-bundle.js';

test('snapshots assets, adds preview headers, and leaves the app build unchanged', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'preview-bundle-test-'));
  try {
    const app = path.join(root, 'app');
    await mkdir(path.join(app, 'dist'), { recursive: true });
    await writeFile(
      path.join(app, 'wrangler.jsonc'),
      JSON.stringify({
        name: 'lvbt-labs-home',
        compatibility_date: '2026-08-31',
        assets: { directory: 'dist' },
      }),
    );
    await writeFile(path.join(app, 'dist/index.html'), '<h1>Labs</h1>');
    await writeFile(path.join(app, 'dist/_headers'), '/*\n  X-Content-Type-Options: nosniff\n');
    const bundle = await preparePreviewBundle(
      app,
      { slug: 'home', worker: 'lvbt-labs-pr-2-home', commit: 'a'.repeat(40), mode: 'temporary' },
      root,
    );
    await writeFile(path.join(app, 'dist/index.html'), 'changed after snapshot');
    expect(await readFile(path.join(bundle.directory, 'assets/index.html'), 'utf8')).toBe(
      '<h1>Labs</h1>',
    );
    expect(await readFile(path.join(bundle.directory, 'assets/_headers'), 'utf8')).toContain(
      'X-Robots-Tag: noindex, nofollow, noarchive',
    );
    expect(await readFile(path.join(app, 'dist/_headers'), 'utf8')).not.toContain('X-Robots-Tag');
    expect(bundle.marker.commit).toBe('a'.repeat(40));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test.each(['analytics', 'symlink'])('rejects unsafe build assets: %s', async (failure) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'preview-bundle-test-'));
  try {
    await mkdir(path.join(root, 'dist'));
    await writeFile(
      path.join(root, 'wrangler.jsonc'),
      JSON.stringify({
        name: 'lvbt-labs-home',
        compatibility_date: '2026-08-31',
        assets: { directory: 'dist' },
      }),
    );
    if (failure === 'symlink')
      await symlink(path.join(root, 'wrangler.jsonc'), path.join(root, 'dist/index.html'));
    else
      await writeFile(
        path.join(root, 'dist/index.html'),
        '<script src="https://static.cloudflareinsights.com/beacon.min.js"></script>',
      );
    await expect(
      preparePreviewBundle(
        root,
        { slug: 'home', worker: 'lvbt-labs-pr-2-home', commit: 'a'.repeat(40), mode: 'temporary' },
        root,
      ),
    ).rejects.toThrow();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
