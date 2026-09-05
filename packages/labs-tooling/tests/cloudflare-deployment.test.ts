import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from 'vitest';
import { cloudflareDeployment } from '../src/cloudflare-deployment.js';
import { deployProjects } from '../src/deployment.js';
import home from '../../../apps/home/lab.config.js';
import { LabManifestV1Schema } from '../src/manifest.js';
import { storeRetirementArchive, verifyStoredArchive } from '../src/archive-store.js';

const oldVersion = '2ae50b24-3d42-48d2-a784-627b60841961';
const newVersion = '1c4deaba-ee53-4c3f-ba65-176ae596cad5';

test.each([false, true])(
  'verifies archive deployment without source (retained secret: %s)',
  async (retainedSecret) => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'lab-retired-deploy-'));
    try {
      const source = path.join(root, 'build');
      await mkdir(source);
      await writeFile(path.join(source, 'index.html'), '<h1>Archived map</h1>');
      const manifest = LabManifestV1Schema.parse({
        ...home,
        slug: 'map',
        status: 'retired',
        dates: { ...home.dates, retired: '2026-09-05' },
        lifecycle: { reason: 'Ended' },
      });
      const stored = await storeRetirementArchive(
        root,
        {
          manifest,
          sourceCommit: 'a'.repeat(40),
          sourceRepository: 'https://github.com/LasVegasForTransit/labs',
        },
        source,
        () => Promise.resolve(),
      );
      await mkdir(path.join(root, 'catalog'));
      await writeFile(path.join(root, 'catalog/map.json'), JSON.stringify(manifest));
      await rm(source, { recursive: true });
      let bundle = '';
      let uploaded = false;
      const result = await deployProjects(
        { packages: [], deploy: ['map'] },
        cloudflareDeployment(root, 'b'.repeat(40), ['map'], {
          assertCheckout() {},
          async run(args, cwd, env) {
            expect(args[1]).not.toBe('turbo');
            expect(cwd).not.toContain('/apps/');
            bundle = cwd;
            if (args[2] === 'versions')
              return JSON.stringify({
                id: newVersion,
                resources: {
                  bindings: [
                    { name: 'ASSETS', type: 'assets' },
                    ...(retainedSecret ? [{ name: 'TOKEN', type: 'secret_text' }] : []),
                  ],
                },
              });
            if (args[2] === 'deployments')
              return JSON.stringify([
                {
                  created_on: '2026-09-05T06:03:00Z',
                  versions: [{ version_id: uploaded ? newVersion : oldVersion, percentage: 100 }],
                },
              ]);
            if (args[2] !== 'deploy' || !env?.WRANGLER_OUTPUT_FILE_PATH)
              throw new Error('Unexpected command');
            await writeFile(
              env.WRANGLER_OUTPUT_FILE_PATH,
              JSON.stringify({
                type: 'deploy',
                version: 1,
                worker_name: 'lvbt-labs-map',
                version_id: newVersion,
              }),
            );
            uploaded = true;
            return '';
          },
          async fetch(input) {
            const url =
              typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
            if (url.includes('lvbt-release.json')) {
              const routes = JSON.parse(
                await readFile(path.join(bundle, 'routes.json'), 'utf8'),
              ) as Record<string, { asset: string }>;
              const asset = routes['/map/lvbt-release.json'];
              if (!asset) throw new Error('Missing marker route');
              return new Response(
                await readFile(path.join(bundle, 'assets', asset.asset.slice(1)), 'utf8'),
              );
            }
            return new Response('<h1>Archived map</h1>');
          },
        }),
      );
      expect(result.ok).toBe(!retainedSecret);
      if (retainedSecret) expect(result.results[0]?.error).toContain('without secrets');
      expect(result.results[0]?.receipt?.previousVersion).toBe(oldVersion);
      expect((await verifyStoredArchive(stored.directory)).site.has('lvbt-release.json')).toBe(
        false,
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);

test('seals the build, journals rollback state before upload, and verifies the stable URL', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'lab-cloudflare-'));
  const app = path.join(root, 'apps/home');
  try {
    await mkdir(path.join(app, 'dist'), { recursive: true });
    await writeFile(
      path.join(app, 'wrangler.jsonc'),
      JSON.stringify({ name: 'lvbt-labs-home', assets: { directory: './dist' } }),
    );
    let uploaded = false;
    const urls: string[] = [];
    const operations = cloudflareDeployment(root, 'a'.repeat(40), ['home'], {
      assertCheckout() {},
      async run(args, cwd, env) {
        if (args[1] === 'turbo') {
          expect(cwd).toBe(root);
          await writeFile(path.join(app, 'dist/index.html'), '<h1>Labs</h1>');
        } else if (args[2] === 'deployments') {
          return JSON.stringify([
            {
              created_on: '2026-09-05T06:03:00Z',
              versions: [{ version_id: uploaded ? newVersion : oldVersion, percentage: 100 }],
            },
          ]);
        } else if (args[2] === 'deploy') {
          const output = env?.WRANGLER_OUTPUT_FILE_PATH;
          if (output === undefined) throw new Error('Missing structured output path');
          expect(
            await readFile(path.join(path.dirname(output), 'journal.jsonl'), 'utf8'),
          ).toContain(oldVersion);
          expect(args).toContain('--strict');
          await writeFile(
            output,
            JSON.stringify({
              type: 'deploy',
              version: 1,
              worker_name: 'lvbt-labs-home',
              version_id: newVersion,
            }),
          );
          uploaded = true;
        } else throw new Error(`Unexpected command: ${args.join(' ')}`);
        return '';
      },
      async fetch(input, options) {
        const url =
          typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        urls.push(url);
        expect(options?.redirect).toBe('manual');
        return url.includes('lvbt-release.json')
          ? Response.json(
              JSON.parse(await readFile(path.join(app, 'dist/lvbt-release.json'), 'utf8')),
            )
          : new Response('<h1>Labs</h1>');
      },
    });
    const result = await deployProjects(
      { packages: ['@lvbt/lab-home'], deploy: ['home'] },
      operations,
    );
    expect(result.ok).toBe(true);
    expect(result.results[0]?.receipt).toEqual({
      previousVersion: oldVersion,
      version: newVersion,
    });
    expect(urls).toEqual([
      `https://labs.lasvegasfortransit.org/lvbt-release.json?commit=${'a'.repeat(40)}`,
      'https://labs.lasvegasfortransit.org/',
    ]);
    const directories = await readdir(path.join(root, '.wrangler/deployments'));
    const journal = await readFile(
      path.join(root, '.wrangler/deployments', directories[0] ?? '', 'journal.jsonl'),
      'utf8',
    );
    expect(journal).toContain('"phase":"verified"');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test.each([1, 2])(
  'refuses upload when checkout validation fails at guard %i',
  async (failureAt) => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'lab-cloudflare-guard-'));
    const app = path.join(root, 'apps/home');
    let guards = 0;
    let uploads = 0;
    try {
      await mkdir(path.join(app, 'dist'), { recursive: true });
      await writeFile(
        path.join(app, 'wrangler.jsonc'),
        JSON.stringify({ name: 'lvbt-labs-home', assets: { directory: './dist' } }),
      );
      const operations = cloudflareDeployment(root, 'a'.repeat(40), ['home'], {
        assertCheckout() {
          guards += 1;
          if (guards === failureAt) throw new Error('Checkout changed');
        },
        async run(args) {
          if (args[1] === 'turbo') {
            await writeFile(path.join(app, 'dist/index.html'), '<h1>Labs</h1>');
            return '';
          }
          if (args[2] === 'deployments') return '[]';
          uploads += 1;
          throw new Error('Unexpected upload');
        },
      });
      const result = await deployProjects(
        { packages: ['@lvbt/lab-home'], deploy: ['home'] },
        operations,
      );
      expect(result.ok).toBe(false);
      expect(guards).toBe(failureAt);
      expect(uploads).toBe(0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);
