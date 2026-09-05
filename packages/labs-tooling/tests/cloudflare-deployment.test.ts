import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from 'vitest';
import { cloudflareDeployment } from '../src/cloudflare-deployment.js';
import { deployProjects } from '../src/deployment.js';

const oldVersion = '2ae50b24-3d42-48d2-a784-627b60841961';
const newVersion = '1c4deaba-ee53-4c3f-ba65-176ae596cad5';

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
