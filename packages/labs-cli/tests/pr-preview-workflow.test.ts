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
  expect(source).toContain('secrets: inherit');
  expect(source).toContain('publication-mode: named-staging');
  expect(source).toContain('protection: public');
  expect(source).toContain('browser-script: preview:acceptance');
  expect(source).not.toContain('CLOUDFLARE_API_TOKEN');
  expect(source).not.toContain('preview:deploy');
});

test('closed cleanup delegates to the same reviewed PR workflow and declared profile selector', async () => {
  const source = await workflow('preview');
  expect(source).toContain('types: [opened, synchronize, reopened, closed]');
  expect(source).toMatch(/release-pr-preview\.yml@[a-f0-9]{40}/);
  expect(source).toContain('pr-release-policy.ts --action "$ACTION"');
  expect(source).toContain('app: ${{ matrix.app }}');
  expect(source.replace(/\s+/gu, ' ')).toContain(
    "github.event.action == 'closed' && github.event.repository.default_branch || github.sha",
  );
  expect(source).not.toContain('pull_request_target:');
  expect(source).not.toContain('preview:cleanup');
});
