import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { findAnalyticsReferences } from '../src/archive-analytics';

describe('findAnalyticsReferences()', () => {
  it('accepts a self-contained archive', async () => {
    const root = await mkdtemp(join(tmpdir(), 'lvbt-archive-'));
    await writeFile(join(root, 'index.html'), '<main>Archived project</main>');

    await expect(findAnalyticsReferences(root)).resolves.toEqual([]);
  });

  it('reports beacon and collector references with their files', async () => {
    const root = await mkdtemp(join(tmpdir(), 'lvbt-archive-'));
    await mkdir(join(root, 'assets'));
    await writeFile(
      join(root, 'index.html'),
      'https://static.cloudflareinsights.com/beacon.min.js',
    );
    await writeFile(join(root, 'assets', 'app.js'), 'https://events.lasvegasfortransit.org/e');

    await expect(findAnalyticsReferences(root)).resolves.toEqual([
      'assets/app.js: events.lasvegasfortransit.org',
      'index.html: static.cloudflareinsights.com',
    ]);
  });

  it('ignores non-executable metadata that cannot make requests', async () => {
    const root = await mkdtemp(join(tmpdir(), 'lvbt-archive-'));
    await mkdir(join(root, 'assets'));
    await writeFile(
      join(root, '_headers'),
      "script-src 'self' https://static.cloudflareinsights.com",
    );
    await writeFile(join(root, 'assets', 'app.js.map'), 'https://events.lasvegasfortransit.org/e');

    await expect(findAnalyticsReferences(root)).resolves.toEqual([]);
  });
});
