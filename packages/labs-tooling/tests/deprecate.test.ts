import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { deprecateLab, deprecateManifest } from '../src/deprecate.js';
import { LabManifestV1Schema } from '../src/manifest.js';
import home from '../../../apps/home/lab.config.js';

const active = LabManifestV1Schema.parse({ ...home, slug: 'example' });
const details = { reason: 'The data source is no longer maintained.', sunset: '2026-12-01' };

describe('deprecateManifest', () => {
  it('preserves app identity, visibility, and publication metadata', () => {
    const result = deprecateManifest(active, details, '2026-09-05');
    expect(result).toEqual({
      ...active,
      status: 'deprecated',
      dates: { ...active.dates, deprecated: '2026-09-05' },
      lifecycle: details,
    });
    expect(active.status).toBe('active');
  });

  it('preserves the original deprecation date on reruns', () => {
    const first = deprecateManifest(active, details, '2026-09-05');
    expect(deprecateManifest(first, details, '2026-09-06')).toEqual(first);
  });

  it.each(['draft', 'retired', 'graduated'] as const)('rejects %s transitions', (status) => {
    expect(() => deprecateManifest({ ...active, status }, details, '2026-09-05')).toThrow(
      /active or deprecated/,
    );
  });

  it('rejects deprecating the home catalog', () => {
    expect(() => deprecateManifest({ ...active, slug: 'home' }, details, '2026-09-05')).toThrow(
      /home/,
    );
  });

  it.each(['', '   '])('rejects an empty reason (%j)', (reason) => {
    expect(() => deprecateManifest(active, { ...details, reason }, '2026-09-05')).toThrow();
  });

  it('rejects a sunset before deprecation', () => {
    expect(() =>
      deprecateManifest(active, { ...details, sunset: '2026-09-04' }, '2026-09-05'),
    ).toThrow(/sunset/i);
  });

  it('rejects a deprecation before publication', () => {
    expect(() => deprecateManifest(active, details, '2000-01-01')).toThrow(/publication/i);
  });

  it('validates successor URLs and retains an existing successor when omitted', () => {
    const successor = { url: 'https://example.org/replacement', label: 'Replacement' };
    const first = deprecateManifest(active, { ...details, successor }, '2026-09-05');
    expect(deprecateManifest(first, details, '2026-09-06').successor).toEqual(successor);
    expect(() =>
      deprecateManifest(
        active,
        { ...details, successor: { ...successor, url: 'javascript:bad' } },
        '2026-09-05',
      ),
    ).toThrow();
  });
});

describe('deprecateLab', () => {
  it('plans without writing, applies once, and preserves unrelated source comments', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'lab-deprecate-'));
    try {
      const directory = path.join(root, 'apps/example');
      await mkdir(directory, { recursive: true });
      const file = path.join(directory, 'lab.config.ts');
      const source = `// Project-owned license declarations.\nexport default ${JSON.stringify(active)} as const;\n`;
      await writeFile(file, source);
      const args = ['example', '--reason', details.reason, '--sunset', details.sunset];
      const planned = await deprecateLab(root, [...args, '--dry-run'], '2026-09-05');
      expect(planned.changed).toBe(false);
      expect(planned.wouldChange).toBe(true);
      expect(await readFile(file, 'utf8')).toBe(source);
      expect((await deprecateLab(root, [...args, '--apply'], '2026-09-05')).changed).toBe(true);
      const applied = await readFile(file, 'utf8');
      expect(applied).toContain('// Project-owned license declarations.');
      expect(applied).toContain('deprecated');
      expect((await deprecateLab(root, [...args, '--apply'], '2026-09-06')).changed).toBe(false);
      expect(await readFile(file, 'utf8')).toBe(applied);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('rejects path traversal and contradictory modes before opening files', async () => {
    await expect(deprecateLab('/missing', ['../outside', '--apply'])).rejects.toThrow(/slug/i);
    await expect(deprecateLab('/missing', ['example', '--apply', '--dry-run'])).rejects.toThrow(
      /together/,
    );
  });
});
