import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const workflow = fileURLToPath(new URL('../../../.github/workflows/ci.yml', import.meta.url));

test('retains Playwright failure artifacts for visual review', async () => {
  const source = await readFile(workflow, 'utf8');

  expect(source).toContain('if: failure()');
  expect(source).toContain(
    'uses: actions/upload-artifact@330a01c490aca151604b8cf639adc76d48f6c5d4',
  );
  expect(source).toContain('apps/**/test-results/');
  expect(source).toContain('packages/**/test-results/');
  expect(source.indexOf('Browser tests')).toBeLessThan(source.indexOf('Upload browser failures'));
});
