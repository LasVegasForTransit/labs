import { z } from 'zod';
import type { MigrationFile } from './migration-tree.js';

const OWNER = "vars.LVBT_DEPLOYMENT_OWNER == 'true'";
function gatedWorkflow(source: string, kind: 'stage' | 'promote', slug: string) {
  if (!source.includes('release-publish.yml@') || !source.includes('attestation-prefix:'))
    throw new Error('Migration requires the reviewed retained-release preset.');
  let result = source
    .replaceAll('app-directory: apps/deploy', `app-directory: deploy/${slug}`)
    .replaceAll(/acceptance-directory: apps\/(?:app|site)/g, `acceptance-directory: apps/${slug}`)
    .replaceAll(
      '      artifact-prefix: app-release',
      `      app: ${slug}\n      artifact-prefix: app-release`,
    )
    .replace('      run-id:', `      app: ${slug}\n      run-id:`);
  if (kind === 'stage') {
    result = result.replace(
      `      app-directory: deploy/${slug}`,
      `      app-directory: deploy/${slug}\n      artifact-source: typed-worker\n      validation-browser-directory: apps/${slug}`,
    );
    result = result.replace(
      '  workflow_dispatch:\n',
      '  workflow_dispatch:\n    inputs:\n      commit:\n        description: Exact reviewed source to stage; production promotion stays explicit\n        type: string\n        required: false\n',
    );
    result = result.replace(
      '  build:\n',
      `  build:\n    if: ${OWNER} && github.ref == 'refs/heads/main' && (github.event_name != 'workflow_dispatch' || inputs.commit == '' || github.sha == inputs.commit)\n`,
    );
  } else {
    result = result.replace(
      'url: ${{ vars.LVBT_PRODUCTION_URL }}',
      'url: https://labs.lasvegasfortransit.org',
    );
    result = result.replace(
      "if: github.ref == 'refs/heads/main'",
      `if: ${OWNER} && github.ref == 'refs/heads/main'`,
    );
  }
  return result;
}

const staticSettings = z.strictObject({
  $schema: z.string().optional(),
  name: z.string(),
  compatibility_date: z.string().default('2026-08-31'),
  compatibility_flags: z.array(z.string()).default(['nodejs_compat']),
  preview_urls: z.boolean().default(true),
  assets: z
    .strictObject({
      directory: z.string(),
      not_found_handling: z.string().optional(),
      html_handling: z.string().optional(),
      run_worker_first: z.union([z.boolean(), z.array(z.string())]).optional(),
    })
    .optional(),
  observability: z
    .strictObject({ enabled: z.boolean(), head_sampling_rate: z.number().optional() })
    .default({ enabled: true, head_sampling_rate: 1 }),
});
type StaticSettings = z.infer<typeof staticSettings>;
function canonicalWorker(slug: string, site: boolean, settings: StaticSettings) {
  const assets = {
    runWorkerFirst: true,
    notFoundHandling:
      settings.assets?.not_found_handling ?? (site ? '404-page' : 'single-page-application'),
    ...(settings.assets?.html_handling === undefined
      ? {}
      : { htmlHandling: settings.assets.html_handling }),
  };
  return `import { bindings, defineConfig, triggers } from 'cf/config';
export default defineConfig(({ isPreview }) => ({
  worker: {
    name: isPreview ? 'lvbt-labs-${slug}-staging' : 'lvbt-labs-${slug}',
    entrypoint: './worker.ts',
    compatibilityDate: ${JSON.stringify(settings.compatibility_date)},
    compatibilityFlags: ${JSON.stringify(settings.compatibility_flags)},
    env: { ASSETS: bindings.assets() },
    assets: ${JSON.stringify(assets)},
    workersDev: isPreview,
    previewUrls: ${settings.preview_urls},
    observability: ${JSON.stringify({ enabled: settings.observability.enabled, ...(settings.observability.head_sampling_rate === undefined ? {} : { headSamplingRate: settings.observability.head_sampling_rate }) })},
    triggers: isPreview ? [] : [triggers.fetch({ pattern: 'labs.lasvegasfortransit.org/${slug}/*', zone: 'lasvegasfortransit.org' })],
  },
}));
`;
}
function staticWorker(slug: string) {
  return `interface Environment { ASSETS: { fetch(request: Request): Promise<Response> } }
export default {
  fetch(request: Request, env: Environment): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/${slug}' || url.pathname.startsWith('/${slug}/'))
      url.pathname = url.pathname.slice('/${slug}'.length) || '/';
    return env.ASSETS.fetch(new Request(url, request));
  },
};
`;
}

function writeMigrationWorker(
  write: (name: string, content: string) => unknown,
  slug: string,
  settings: { site: boolean; value: StaticSettings },
) {
  write(
    `deploy/${slug}/cloudflare.config.ts`,
    canonicalWorker(slug, settings.site, settings.value),
  );
  write(`deploy/${slug}/worker.ts`, staticWorker(slug));
  write(
    `deploy/${slug}/tests/routing.test.ts`,
    `import assert from 'node:assert/strict';
import { test } from 'node:test';
import worker from '../worker.ts';
void test('the permanent path reaches the same asset without changing the request method', async () => {
  let observed = '';
  const response = await worker.fetch(new Request('https://labs.lasvegasfortransit.org/${slug}/document', { method: 'POST' }), { ASSETS: { fetch(request: Request) {
    observed = new URL(request.url).pathname + ' ' + request.method;
    return Promise.resolve(new Response('asset'));
  } } });
  assert.equal(observed, '/document POST');
  assert.equal(await response.text(), 'asset');
});
`,
  );

  write(
    `deploy/${slug}/eslint.config.mjs`,
    "export { config as default } from '@lasvegasfortransit/eslint-config/browser';\n",
  );
  write(
    `deploy/${slug}/tsconfig.json`,
    JSON.stringify(
      {
        extends: '@lasvegasfortransit/typescript-config/base.json',
        include: ['*.ts', 'tests'],
        compilerOptions: { types: ['node'], allowImportingTsExtensions: true },
      },
      null,
      2,
    ) + '\n',
  );
  write(
    `deploy/${slug}/package.json`,
    JSON.stringify(
      {
        name: `@lasvegasfortransit/${slug}-deploy`,
        private: true,
        type: 'module',
        scripts: {
          lint: 'eslint . --max-warnings 0',
          'check-types': 'tsc --noEmit',
          test: 'node --test tests/*.test.ts',
        },
        devDependencies: {
          '@lasvegasfortransit/eslint-config':
            'file:../../.lvbt/web-platform/packages/eslint-config',
          '@lasvegasfortransit/typescript-config':
            'file:../../.lvbt/web-platform/packages/typescript-config',
          '@types/node': 'catalog:',
          cf: 'catalog:',
          eslint: 'catalog:',
          typescript: 'catalog:',
          wrangler: 'catalog:',
        },
      },
      null,
      2,
    ) + '\n',
  );
}

export function configureMigrationRelease(
  files: Map<string, MigrationFile>,
  slug: string,
  repository: string,
  options: { site: boolean; metadata: Record<string, unknown> },
) {
  const settings = staticSettings.parse(options.metadata);
  if (settings.name !== `lvbt-labs-${slug}`)
    throw new Error('Migration must retain its declared permanent Worker name.');
  const read = (name: string) => {
    const file = files.get(name);
    if (!file) throw new Error(`Missing preset release input: ${name}`);
    return file.content.toString();
  };
  const write = (name: string, content: string) =>
    files.set(name, { content: Buffer.from(content), mode: '100644', generated: true });
  const tooling = JSON.parse(read('.lvbt/tooling.json')) as {
    release: {
      appDirectory?: string;
      artifactSource?: string;
      productionWorker?: string;
      previewWorker?: string;
      productionUrlEnv?: string;
      previewUrlEnv?: string;
      [key: string]: unknown;
    };
  };
  const {
    appDirectory: _directory,
    artifactSource: _source,
    productionWorker: _worker,
    previewWorker: _preview,
    productionUrlEnv: _production,
    previewUrlEnv: _previewUrl,
    ...common
  } = tooling.release;
  tooling.release = {
    ...common,
    repository,
    apps: {
      [slug]: {
        appDirectory: `deploy/${slug}`,
        artifactSource: 'typed-worker',
        typedConfig: 'cloudflare.config.ts',
        assetsDirectory: `../../apps/${slug}/dist`,
        productionWorker: `lvbt-labs-${slug}`,
        previewWorker: `lvbt-labs-${slug}-staging`,
        productionUrl: 'https://labs.lasvegasfortransit.org',
        previewUrlEnv: 'LVBT_PREVIEW_URL',
        publicPath: `/${slug}/`,
        previewBindings: { ASSETS: { type: 'assets' } },
      },
    },
  };
  write('.lvbt/tooling.json', JSON.stringify(tooling, null, 2) + '\n');
  const appPackage = JSON.parse(read(`apps/${slug}/package.json`)) as {
    scripts: Record<string, string>;
  };
  appPackage.scripts['worker:test:browser'] = 'tsx scripts/release-smoke.ts';
  write(`apps/${slug}/package.json`, JSON.stringify(appPackage, null, 2) + '\n');
  write(
    '.github/workflows/deploy.yml',
    gatedWorkflow(read('.github/workflows/deploy.yml'), 'stage', slug),
  );
  write(
    '.github/workflows/promote.yml',
    gatedWorkflow(read('.github/workflows/promote.yml'), 'promote', slug),
  );
  writeMigrationWorker(write, slug, { site: options.site, value: settings });
}
