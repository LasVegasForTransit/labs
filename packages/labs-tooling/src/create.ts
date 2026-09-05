import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { readCreateInput } from './create-input.js';

async function writeProject(directory: string, files: Record<string, string>): Promise<void> {
  await mkdir(directory);
  for (const [name, content] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(directory, name)), { recursive: true });
    await writeFile(path.join(directory, name), content);
  }
  execFileSync('pnpm', ['exec', 'prettier', '--write', directory], {
    cwd: path.join(directory, '../..'),
    stdio: 'pipe',
  });
}

function assertAvailableSlug(root: string, slug: string): void {
  const reserved = [
    path.join(root, 'apps', slug),
    path.join(root, 'retired', slug),
    path.join(root, 'catalog', `${slug}.json`),
    path.join(root, 'catalog', `${slug}.ts`),
    path.join(root, 'catalog', slug),
  ];
  if (reserved.some((entry) => existsSync(entry))) {
    throw new Error(`The slug ${slug} is already reserved.`);
  }
}

async function templatePackage(reference: string, slug: string, site: boolean) {
  const pkg = JSON.parse(await readFile(path.join(reference, 'package.json'), 'utf8')) as {
    name: string;
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
    scripts: Record<string, string>;
  };
  pkg.name = `@lvbt/lab-${slug}`;
  pkg.dependencies['@lvbt/labs-tooling'] = 'workspace:*';
  pkg.dependencies['@lvbt/brand'] = 'workspace:*';
  pkg.dependencies['@lvbt/ui'] = 'workspace:*';
  for (const name of Object.keys(pkg.devDependencies).filter((name) => name.startsWith('@lvbt/'))) {
    pkg.devDependencies[name] =
      `file:../../.lvbt/web-platform/packages/${name.slice('@lvbt/'.length)}`;
  }
  pkg.devDependencies['@types/node'] = 'catalog:';
  pkg.scripts['build:archive'] = site
    ? 'astro build --outDir dist-archive'
    : 'vite build --outDir dist-archive';
  pkg.scripts.dev = site ? 'astro dev --host 127.0.0.1' : 'vite --host 127.0.0.1';
  pkg.scripts.preview = 'pnpm build && wrangler dev';
  return pkg;
}

function browserTest(base: string): string {
  return `import { expect, test } from '@playwright/test';
import { LabManifestV1Schema } from '@lvbt/labs-tooling/manifest';
import config from '../../lab.config';
const manifest = LabManifestV1Schema.parse(config);
test('opens at its permanent path', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('${base}');
  await expect(page.locator('h1')).toHaveText(manifest.title);
  await page.reload();
  await expect(page.locator('h1')).toBeVisible();
  if (manifest.status === 'deprecated' || manifest.status === 'retired') {
    const notice = page.getByRole('status');
    await expect(notice).toContainText(manifest.lifecycle?.reason ?? '');
    if (manifest.status === 'deprecated') await expect(notice.locator('time')).toHaveAttribute('datetime', manifest.lifecycle?.sunset ?? '');
    if (manifest.successor) {
      const link = notice.getByRole('link', { name: manifest.successor.label });
      await expect(link).toHaveAttribute('href', manifest.successor.url);
      await page.keyboard.press('Tab');
      await expect(link).toBeFocused();
    }
  } else {
    await expect(page.getByRole('status')).toHaveCount(0);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('page.png'), fullPage: true });
});
`;
}

export async function createLab(root: string, args: string[]): Promise<void> {
  const { apply, json, manifest } = await readCreateInput(args);
  assertAvailableSlug(root, manifest.slug);
  const directory = path.join(root, 'apps', manifest.slug);
  const site = manifest.profile === 'site';
  const reference = path.join(
    root,
    '.lvbt/web-platform/examples',
    site ? 'with-astro/apps/site' : 'with-vite-react/apps/app',
  );
  const pkg = await templatePackage(reference, manifest.slug, site);
  const base = `/${manifest.slug}/`;
  const files: Record<string, string> = {
    'src/styles.css':
      "@import 'tailwindcss';\n@import '@lvbt/brand/tokens.css';\n@import '@lvbt/ui/lifecycle.css';\nbody { margin: 0; font-family: var(--font-sans); color: var(--color-on-surface); background: var(--color-surface); }\nmain { max-width: 64rem; margin-inline: auto; padding: 2rem 1.5rem; }\nh1 { font-size: 2rem; font-weight: 800; }\n",
    'package.json': JSON.stringify(pkg, null, 2),
    'lab.config.ts': `export default ${JSON.stringify(manifest, null, 2)} as const;\n`,
    'README.md': `# ${manifest.title}\n\n${manifest.summary}\n\nRun \`pnpm lab dev ${manifest.slug}\`.\n\n[Project documentation](docs/README.md) contains ownership and operation details.\n`,
    'docs/README.md': `# ${manifest.title}\n\n${manifest.summary}\n\nMaintainers: ${manifest.maintainers.join(', ')}.\n\n## Licenses\n\nCode: ${manifest.licenses.code}. Content: ${manifest.licenses.content}. Data: ${manifest.licenses.data}. Assets: ${manifest.licenses.assets}.\n`,
    'wrangler.jsonc': JSON.stringify(
      {
        name: `lvbt-labs-${manifest.slug}`,
        compatibility_date: '2026-09-04',
        main: 'src/worker.ts',
        assets: {
          directory: './dist',
          binding: 'ASSETS',
          run_worker_first: true,
          not_found_handling: site ? '404-page' : 'single-page-application',
        },
        routes: [
          {
            pattern: `labs.lasvegasfortransit.org/${manifest.slug}`,
            zone_name: 'lasvegasfortransit.org',
          },
          {
            pattern: `labs.lasvegasfortransit.org/${manifest.slug}/*`,
            zone_name: 'lasvegasfortransit.org',
          },
        ],
      },
      null,
      2,
    ),
    'tests/manifest.test.ts': `import { expect, test } from 'vitest';\nimport { LabManifestV1Schema } from '@lvbt/labs-tooling/manifest';\nimport manifest from '../lab.config';\ntest('declares project ownership', () => { expect(LabManifestV1Schema.parse(manifest).slug).toBe(${JSON.stringify(manifest.slug)}); });\n`,
    'src/worker.ts': `export default { fetch(request: Request, env: { ASSETS: { fetch(request: Request): Promise<Response> } }) { const url = new URL(request.url); url.pathname = url.pathname.replace(/^\\/${manifest.slug}(?:\\/|$)/, '/'); return env.ASSETS.fetch(new Request(url, request)); } };\n`,
    'playwright.config.ts': `import { defineConfig } from '@playwright/test';\nimport { sharedConfig } from '@lvbt/playwright-config';\nexport default defineConfig({ ...sharedConfig, use: { ...sharedConfig.use, baseURL: 'http://127.0.0.1:8899' }, webServer: { command: 'pnpm build && pnpm exec wrangler dev --port 8899', url: 'http://127.0.0.1:8899${base}', reuseExistingServer: false } });\n`,
    'tests/e2e/home.spec.ts': browserTest(base),
  };
  for (const name of ['eslint.config.js', 'tsconfig.json', 'vitest.config.ts']) {
    files[name] = await readFile(path.join(reference, name), 'utf8');
  }
  if (site) {
    files['astro.config.ts'] =
      `import { defineConfig } from 'astro/config';\nimport tailwindcss from '@tailwindcss/vite';\nexport default defineConfig({site:'https://labs.lasvegasfortransit.org',base:'${base}',build:{format:'directory'},vite:{plugins:[tailwindcss()]}});\n`;
    files['src/pages/index.astro'] =
      `---\nimport '../styles.css';\nimport LabLifecycleNotice from '@lvbt/ui/astro/lifecycle-notice';\nimport manifest from '../../lab.config';\n---\n<html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width" /><meta name="robots" content="noindex" /><title>{manifest.title}</title></head><body><main><LabLifecycleNotice manifest={manifest} /><h1>{manifest.title}</h1><p>{manifest.summary}</p></main></body></html>\n`;
  } else {
    files['vite.config.ts'] =
      `import { defineConfig } from 'vite';\nimport react from '@vitejs/plugin-react';\nimport tailwindcss from '@tailwindcss/vite';\nexport default defineConfig({base:'${base}',plugins:[react(),tailwindcss()]});\n`;
    files['index.html'] =
      '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta name="robots" content="noindex"><title>Lab</title></head><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>\n';
    files['src/main.tsx'] =
      `import { createRoot } from 'react-dom/client';\nimport { LabLifecycleNotice } from '@lvbt/ui';\nimport './styles.css';\nimport manifest from '../lab.config';\ndocument.title = manifest.title;\nconst root = document.getElementById('root');\nif (root) createRoot(root).render(<main><LabLifecycleNotice manifest={manifest} /><h1>{manifest.title}</h1><p>{manifest.summary}</p></main>);\n`;
  }
  if (apply) {
    await writeProject(directory, files);
  }
  process.stdout.write(
    json
      ? `${JSON.stringify({ command: 'create', ok: true, changed: apply, manifest, slug: manifest.slug, files: Object.keys(files) })}\n`
      : `${apply ? 'Created' : 'Planned'} apps/${manifest.slug} (${manifest.profile}, draft, unlisted).\n${Object.keys(
          files,
        )
          .map((name) => `  ${name}`)
          .join(
            '\n',
          )}\n${apply ? 'Run pnpm install, then pnpm check.' : 'No files written. Add --apply to create this project.'}\n`,
  );
}
