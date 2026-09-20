import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const workflow = fileURLToPath(new URL('../../../.github/workflows/ci.yml', import.meta.url));
const previewWorkflow = fileURLToPath(
  new URL('../../../.github/workflows/preview.yml', import.meta.url),
);

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

test('runs validation once for each pull request commit', async () => {
  const source = await readFile(workflow, 'utf8');

  expect(source).toMatch(/^ {2}pull_request:$/m);
  expect(source).not.toMatch(/^ {2}push:$/m);
  expect(source).toMatch(/^ {2}workflow_call:$/m);
  expect(source).toMatch(/^ {2}workflow_dispatch:$/m);
});

test('captures only structured preview output in the deployment receipt', async () => {
  const source = await readFile(previewWorkflow, 'utf8');

  expect(source).toContain('pnpm --silent preview:deploy');
  expect(source).not.toContain('run preview:deploy --');
});
