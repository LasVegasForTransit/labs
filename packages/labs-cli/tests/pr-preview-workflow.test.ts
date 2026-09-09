import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, test } from 'vitest';

const workflow = (name: string) =>
  readFile(path.resolve(import.meta.dirname, `../../../.github/workflows/${name}.yml`), 'utf8');

test('preview workflow runs credentialed uploads only for enabled same-repository pull requests', async () => {
  const source = await workflow('preview');
  expect(source).toContain('pull_request:');
  expect(source).not.toContain('pull_request_target:');
  expect(source).toContain('github.event.pull_request.head.repo.full_name == github.repository');
  expect(source).toContain("vars.CLOUDFLARE_PREVIEWS_ENABLED == 'true'");
  expect(source).toContain('environment: preview');
  expect(source).toContain('CLOUDFLARE_PREVIEW_API_TOKEN');
  expect(source.indexOf('pnpm test:e2e')).toBeLessThan(source.indexOf('pnpm preview:deploy'));
  expect(source).toContain('pnpm preview:deploy');
  expect(source).toContain('--apply --json');
});

test('preview cleanup runs from the trusted default branch only after a pull request closes', async () => {
  const source = await workflow('preview-cleanup');
  expect(source).toContain('types: [closed]');
  expect(source).toContain('ref: main');
  expect(source).not.toContain('pull_request_target:');
  expect(source).toContain('pnpm preview:cleanup');
  expect(source).toContain('--apply --json');
});
