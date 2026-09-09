import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const workflow = fileURLToPath(new URL('../../../.github/workflows/ci.yml', import.meta.url));

test('retains Playwright failure artifacts for visual review', async () => {
  const source = await readFile(workflow, 'utf8');

  expect(source).toContain('if: failure()');
  expect(source).toContain(
    'uses: actions/upload-artifact@b7c566a772e6b6bfb58ed0dc250532a479d7789f',
  );
  expect(source).toContain('apps/**/test-results/');
  expect(source).toContain('packages/**/test-results/');
  expect(source.indexOf('Browser tests')).toBeLessThan(source.indexOf('Upload browser failures'));
});
