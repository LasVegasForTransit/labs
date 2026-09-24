import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, vi } from 'vitest';
import home from '../../../apps/home/lab.config.js';
import { createLab } from '../src/create.js';
import { writeProject } from '../src/create-write.js';

vi.mock('../src/create-write.js', () => ({ writeProject: vi.fn() }));

test.each(['site', 'app'])(
  'creates an isolated archive suite for the %s profile',
  async (profile) => {
    const temporary = await mkdtemp(path.join(os.tmpdir(), 'lvbt-create-archive-'));
    const output = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    const root = fileURLToPath(new URL('../../..', import.meta.url));
    try {
      const input = path.join(temporary, 'manifest.json');
      await writeFile(
        input,
        JSON.stringify({
          ...home,
          slug: 'archive-example',
          profile,
          status: 'draft',
          visibility: 'unlisted',
        }),
      );
      await createLab(root, ['--manifest', input, '--apply', '--json']);
      const files = vi.mocked(writeProject).mock.lastCall?.[1];
      const pkg = JSON.parse(String(files?.['package.json'])) as {
        scripts: Record<string, string>;
      };
      expect(pkg.scripts['test:archive']).toBe(
        'playwright test --config playwright.archive.config.ts',
      );
      expect(files?.['playwright.archive.config.ts']).toContain('./tests/e2e/archive');
      expect(files?.['playwright.config.ts']).toContain('testIgnore');
      const browser = String(files?.['tests/e2e/home.spec.ts']);
      const archive = String(files?.['tests/e2e/archive/read-only.spec.ts']);
      for (const suite of [browser, archive]) {
        expect(suite).toContain('expectNoAccessibilityViolations');
        expect(suite).toContain('monitorPageHealth');
        expect(suite).toContain("testInfo.snapshotSuffix = 'lvbt'");
        expect(suite).toContain('toHaveScreenshot');
        expect(suite).not.toContain('page.screenshot');
      }
      expect(archive).toContain('createArchiveContext');
      expect(archive).toContain('archive.failures');
      expect(archive).toContain('page.reload()');
      if (profile === 'site') {
        const template = await readFile(
          new URL('../templates/generated-project/site-index.astro', import.meta.url),
          'utf8',
        );
        expect(files?.['src/pages/index.astro']).toBe(template);
      }
      for (const name of [
        'tests/e2e/home.spec.ts-snapshots/page-desktop-lvbt.png',
        'tests/e2e/home.spec.ts-snapshots/page-mobile-lvbt.png',
        'tests/e2e/archive/read-only.spec.ts-snapshots/archive-desktop-lvbt.png',
        'tests/e2e/archive/read-only.spec.ts-snapshots/archive-mobile-lvbt.png',
      ]) {
        expect(files?.[name]).toBeInstanceOf(Buffer);
        expect((files?.[name] as Buffer).subarray(1, 4).toString()).toBe('PNG');
      }
    } finally {
      output.mockRestore();
      vi.mocked(writeProject).mockClear();
      await rm(temporary, { recursive: true, force: true });
    }
  },
);
