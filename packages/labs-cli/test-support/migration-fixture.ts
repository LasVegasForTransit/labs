import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import home from '../../../apps/home/lab.config.js';
import { migrationSource } from '../src/migration-source.js';
import type { MigrationFile } from '../src/migration-tree.js';

// eslint-disable-next-line max-lines-per-function -- Keep the imported Git fixture auditable in one place.
export async function withMigrationFixture(run: (root: string) => void | Promise<void>) {
  const repositoryRoot = fileURLToPath(new URL('../../..', import.meta.url));
  const source = migrationSource(repositoryRoot);
  const files = new Map<string, MigrationFile>();
  const prefixes = [
    '.lvbt/web-platform/',
    'packages/brand/',
    'packages/ui/',
    'packages/lab-runtime/',
  ];
  for (const [name, entry] of source.entries) {
    if (
      prefixes.some((prefix) => name.startsWith(prefix)) ||
      [
        '.lvbt/web-platform.json',
        '.npmrc',
        'pnpm-workspace.yaml',
        'LICENSE',
        'docs/development/reference/brand-and-ui.md',
        'docs/security/reference/secrets.md',
      ].includes(name)
    )
      files.set(name, { content: source.read(name), mode: entry.mode });
  }
  const app = 'apps/migration-example';
  const example = '.lvbt/web-platform/examples/with-vite-react/apps/app/';
  for (const [name, entry] of source.entries) {
    if (name.startsWith(example))
      files.set(`${app}/${name.slice(example.length)}`, {
        content: source.read(name),
        mode: entry.mode,
      });
  }
  const manifest = {
    ...home,
    slug: 'migration-example',
    title: 'Migration example',
    profile: 'app',
  };
  const examplePackage = JSON.parse(source.read(`${example}package.json`).toString()) as {
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
    scripts: Record<string, string>;
    [key: string]: unknown;
  };
  examplePackage.name = '@lvbt/lab-migration-example';
  examplePackage.dependencies = {
    ...examplePackage.dependencies,
    '@lvbt/brand': 'workspace:*',
    '@lvbt/lab-runtime': 'workspace:*',
    '@lvbt/ui': 'workspace:*',
  };
  for (const dependency of [
    '@lasvegasfortransit/eslint-config',
    '@lasvegasfortransit/playwright-config',
    '@lasvegasfortransit/typescript-config',
    '@lasvegasfortransit/vitest-config',
  ])
    examplePackage.devDependencies[dependency] =
      `file:../../.lvbt/web-platform/packages/${dependency.slice('@lasvegasfortransit/'.length)}`;
  examplePackage.scripts['build:archive'] = 'vite build --outDir dist-archive';
  examplePackage.scripts['test:archive'] = 'playwright test --config playwright.archive.config.ts';
  const additions = {
    [`${app}/lab.config.ts`]: `export default ${JSON.stringify(manifest, null, 2)} as const;\n`,
    [`${app}/package.json`]: `${JSON.stringify(examplePackage, null, 2)}\n`,
    [`${app}/wrangler.jsonc`]: `${JSON.stringify({ name: 'lvbt-labs-migration-example' }, null, 2)}\n`,
    [`${app}/docs/README.md`]: '# Migration example\n',
    [`${app}/vite.config.ts`]: `import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
export default defineConfig({ base: '/migration-example/', plugins: [react(), tailwindcss()] });
`,
    [`${app}/src/App.tsx`]: `import { LabLifecycleNotice } from '@lvbt/ui';

import manifest from '../lab.config';

export function App() {
  return (
    <main>
      <LabLifecycleNotice manifest={manifest} />
      <h1>{manifest.title}</h1>
      <p>{manifest.summary}</p>
    </main>
  );
}
`,
    [`${app}/tests/e2e/app.spec.ts`]: `import { expect, test } from '@playwright/test';
import { expectNoAccessibilityViolations } from '@lasvegasfortransit/playwright-config/accessibility';
import { monitorPageHealth } from '@lasvegasfortransit/playwright-config/page-health';
test('serves the migrated lab', async ({ page }) => {
  const health = monitorPageHealth(page);
  await page.goto('/migration-example/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Migration example');
  await expectNoAccessibilityViolations(page);
  health.assertNoErrors();
});
`,
    [`${app}/playwright.config.ts`]: `import { defineConfig } from '@playwright/test';

import { sharedConfig } from '@lasvegasfortransit/playwright-config';

const url = 'http://127.0.0.1:4173';
export default defineConfig({
  ...sharedConfig,
  testIgnore: ['**/archive/**'],
  use: { ...sharedConfig.use, baseURL: url },
  webServer: {
    command: 'pnpm preview',
    url: url + '/migration-example/',
    reuseExistingServer: false,
  },
});
`,
    [`${app}/playwright.archive.config.ts`]: `import { defineConfig } from '@playwright/test';

import { sharedConfig } from '@lasvegasfortransit/playwright-config';

export default defineConfig({
  ...sharedConfig,
  testDir: './tests/e2e/archive',
  outputDir: './test-results/archive',
});
`,
    [`${app}/tests/e2e/archive/read-only.spec.ts`]: `import { expect, test } from '@playwright/test';
import { createArchiveContext, readProjectArchiveFiles } from '@lvbt/lab-runtime/archive';
import { expectNoAccessibilityViolations } from '@lasvegasfortransit/playwright-config/accessibility';
import { monitorPageHealth } from '@lasvegasfortransit/playwright-config/page-health';

test('serves the migrated archive without live services', async ({ browser, viewport }) => {
  const archive = await createArchiveContext(browser, {
    slug: 'migration-example',
    files: await readProjectArchiveFiles(),
    viewport: viewport ?? undefined,
  });
  try {
    const page = await archive.context.newPage();
    const health = monitorPageHealth(page);
    await page.goto(archive.origin + '/migration-example/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Migration example');
    await expectNoAccessibilityViolations(page);
    health.assertNoErrors();
    expect(archive.failures).toEqual([]);
  } finally {
    await archive.context.close();
  }
});
`,
  };
  const prettier = path.join(repositoryRoot, 'node_modules/.bin/prettier');
  for (const [name, content] of Object.entries(additions))
    files.set(name, {
      content: Buffer.from(
        execFileSync(prettier, ['--stdin-filepath', name], { input: content, encoding: 'utf8' }),
      ),
      mode: '100644',
    });
  const root = await mkdtemp(path.join(os.tmpdir(), 'lvbt-migration-tree-'));
  try {
    execFileSync('git', ['init', '--quiet'], { cwd: root });
    const chunks: Buffer[] = [
      Buffer.from(
        'commit refs/heads/fixture\ncommitter Test <test@example.org> 1 +0000\ndata 7\nfixture\n',
      ),
    ];
    for (const [name, file] of files)
      chunks.push(
        Buffer.from(`M ${file.mode} inline ${name}\ndata ${file.content.length}\n`),
        file.content,
        Buffer.from('\n'),
      );
    execFileSync('git', ['fast-import', '--quiet'], {
      cwd: root,
      input: Buffer.concat([...chunks, Buffer.from('\n')]),
    });
    execFileSync('git', ['symbolic-ref', 'HEAD', 'refs/heads/fixture'], { cwd: root });
    execFileSync('git', ['read-tree', 'HEAD'], { cwd: root });
    execFileSync('git', ['checkout-index', '--all'], { cwd: root });
    execFileSync('git', ['remote', 'add', 'origin', 'https://github.com/LasVegasForTransit/labs'], {
      cwd: root,
    });
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
