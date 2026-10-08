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
  expect(source).toMatch(/uses: actions\/upload-artifact@[a-f0-9]{40}/);
  expect(source).toContain('apps/**/test-results/');
  expect(source).toContain('packages/**/test-results/');
  expect(source.indexOf('pnpm check')).toBeLessThan(source.indexOf('Upload browser failures'));
  expect(source.indexOf('playwright install')).toBeLessThan(source.indexOf('pnpm check'));
  expect(source).not.toContain('pnpm test:e2e');
});

test('runs validation once for each pull request commit', async () => {
  const source = await readFile(workflow, 'utf8');

  expect(source).toMatch(/^ {2}pull_request:$/m);
  expect(source).not.toMatch(/^ {2}push:$/m);
  expect(source).toMatch(/^ {2}workflow_call:$/m);
  expect(source).toMatch(/^ {2}workflow_dispatch:$/m);
});

test('delegates affected profile previews and closed cleanup to the shared reviewed workflow', async () => {
  const source = await readFile(previewWorkflow, 'utf8');
  expect(source).toContain('types: [opened, synchronize, reopened, closed]');
  expect(source).toMatch(/release-pr-preview\.yml@[a-f0-9]{40}/);
  expect(source).toContain('pr-release-policy.ts');
  expect(source).toContain('publication-mode: named-staging');
  expect(source).toContain('preview-script: api');
  expect(source).toContain('smoke-script: api');
  expect(source).toContain('browser-script: preview:acceptance');
  expect(source).not.toContain('preview:deploy');
  expect(source).not.toContain('CLOUDFLARE_API_TOKEN');
});

test('verifies retained artifacts after builds and stages instead of publishing production', async () => {
  const source = await readFile(workflow, 'utf8');
  const deploy = await readFile(
    fileURLToPath(new URL('../../../.github/workflows/deploy.yml', import.meta.url)),
    'utf8',
  );

  const packageSource = JSON.parse(
    await readFile(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'),
  ) as { scripts: { validate: string } };
  const turbo = JSON.parse(
    await readFile(fileURLToPath(new URL('../../../turbo.json', import.meta.url)), 'utf8'),
  ) as { tasks: { validate: { cache: boolean; dependsOn: string[] } } };
  expect(source).toContain('pnpm check');
  expect(source).not.toContain('pnpm deploy:cf:dry-run');
  expect(packageSource.scripts.validate).toContain('tsx src/release-dry-run.ts');
  expect(turbo.tasks.validate.cache).toBe(false);
  expect(turbo.tasks.validate.dependsOn).toContain('build');
  expect(deploy).toContain('target: preview');
  expect(deploy).not.toContain('target: production');
  expect(deploy).not.toContain('pnpm deploy:affected');
});

test('all dependency and full-history secret gates are required uncached pnpm check tasks', async () => {
  const root = fileURLToPath(new URL('../../../', import.meta.url));
  const source = await readFile(workflow, 'utf8');
  const manifest = JSON.parse(await readFile(root + '/package.json', 'utf8')) as {
    scripts: Record<string, string>;
  };
  const turbo = JSON.parse(await readFile(root + '/turbo.json', 'utf8')) as {
    tasks: Record<string, { cache?: boolean; dependsOn?: string[] }>;
  };
  expect(manifest.scripts['security:dependencies']).toBe('pnpm audit --audit-level=high');
  expect(manifest.scripts['security:secrets']).toBe('lvbt check secrets');
  for (const task of ['security:dependencies', 'security:secrets']) {
    expect(turbo.tasks['//#' + task]?.cache).toBe(false);
    for (const key of [
      'validate',
      '@lasvegasfortransit/labs-cli#validate',
      '@lasvegasfortransit/lab-transit-funding#validate',
    ])
      expect(turbo.tasks[key]?.dependsOn).toContain('//#' + task);
  }
  expect(source).toContain('fetch-depth: 0');
  expect(source).not.toContain('docker run');
  expect(source).not.toContain('pnpm audit --audit-level=high');
});

test.each(['deploy.yml', 'promote.yml'])(
  '%s selects the configured named publication path',
  async (filename) => {
    const root = fileURLToPath(new URL('../../../', import.meta.url));
    const tooling = JSON.parse(await readFile(root + '/.lvbt/tooling.json', 'utf8')) as {
      release: { publicationMode: string };
    };
    const source = await readFile(root + '/.github/workflows/' + filename, 'utf8');
    const mode = /^ {6}publication-mode: (\S+)$/m.exec(source)?.[1] ?? 'version';
    expect(mode).toBe(tooling.release.publicationMode);
  },
);
