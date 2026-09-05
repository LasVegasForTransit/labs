import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import ts from 'typescript';
import { z } from 'zod';

import { activeVersion, uploadedVersion } from './cloudflare-release.js';
import { assertDeploymentCheckout } from './deployment-checkout.js';
import type { DeploymentOperations } from './deployment.js';
import { sealArtifact, verifyReleaseResponse, type ReleaseMarker } from './release-artifact.js';

type Run = (args: string[], cwd: string, env?: NodeJS.ProcessEnv) => Promise<string>;
interface DeploymentDependencies {
  run?: Run;
  fetch?: typeof fetch;
  assertCheckout?: typeof assertDeploymentCheckout;
}
const execute = promisify(execFile);
const run: Run = async (args, cwd, env) => {
  const result = await execute('pnpm', args, {
    cwd,
    env: { ...process.env, ...env, WRANGLER_LOG_SANITIZE: 'true' },
    maxBuffer: 16 * 1024 * 1024,
  });
  return result.stdout;
};
const configSchema = z.object({ name: z.string(), assets: z.object({ directory: z.string() }) });

async function buildProjects(
  context: { root: string; commit: string; slugs: string[]; command: Run },
  packages: string[],
): Promise<Map<string, ReleaseMarker>> {
  const { root, commit, slugs, command } = context;
  await command(
    ['exec', 'turbo', 'run', 'build', ...packages.map((name) => `--filter=${name}`)],
    root,
  );
  const markers = new Map<string, ReleaseMarker>();
  for (const slug of slugs) {
    const app = path.join(root, 'apps', slug);
    const file = path.join(app, 'wrangler.jsonc');
    const parsed = ts.parseConfigFileTextToJson(file, await readFile(file, 'utf8'));
    if (parsed.error) throw new Error(`Invalid Worker configuration for ${slug}.`);
    const config = configSchema.parse(parsed.config);
    if (config.name !== `lvbt-labs-${slug}`) throw new Error(`Worker name does not match ${slug}.`);
    const directory = path.resolve(app, config.assets.directory);
    const relative = path.relative(app, directory);
    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative))
      throw new Error('Assets must remain inside their owning app.');
    markers.set(slug, await sealArtifact(directory, { slug, commit }));
  }
  return markers;
}

async function verifyPublicArtifact(request: typeof fetch, marker: ReleaseMarker): Promise<void> {
  const { slug, commit } = marker;
  const base = `https://labs.lasvegasfortransit.org/${slug === 'home' ? '' : `${slug}/`}`;
  const response = await request(`${base}lvbt-release.json?commit=${commit}`, {
    redirect: 'manual',
    cache: 'no-store',
    signal: AbortSignal.timeout(15000),
  });
  await verifyReleaseResponse(response, marker);
  const page = await request(base, {
    redirect: 'manual',
    cache: 'no-store',
    signal: AbortSignal.timeout(15000),
  });
  if (page.status !== 200) throw new Error(`The project page returned HTTP ${page.status}.`);
}

export function cloudflareDeployment(
  root: string,
  commit: string,
  slugs: string[],
  dependencies: DeploymentDependencies = {},
): DeploymentOperations {
  const command = dependencies.run ?? run;
  const request = dependencies.fetch ?? fetch;
  const assertCheckout = dependencies.assertCheckout ?? assertDeploymentCheckout;
  let markers = new Map<string, ReleaseMarker>();
  const journals = new Map<string, string>();
  const appDirectory = (slug: string) => path.join(root, 'apps', slug);
  const wrangler = (slug: string, args: string[], env?: NodeJS.ProcessEnv) =>
    command(['exec', 'wrangler', ...args], appDirectory(slug), env);
  async function currentVersion(slug: string) {
    return activeVersion(JSON.parse(await wrangler(slug, ['deployments', 'list', '--json'])));
  }
  async function journal(slug: string, entry: unknown) {
    const file = journals.get(slug);
    if (file === undefined) throw new Error(`No deployment journal exists for ${slug}.`);
    await appendFile(file, `${JSON.stringify(entry)}\n`);
  }
  return {
    async build(packages) {
      markers = await buildProjects({ root, commit, slugs, command }, packages);
      assertCheckout(root, commit);
    },
    async deploy(slug) {
      if (!markers.has(slug)) throw new Error(`No sealed build exists for ${slug}.`);
      const previousVersion = await currentVersion(slug);
      const directory = path.join(
        root,
        '.wrangler',
        'deployments',
        `${commit}-${slug}-${randomUUID()}`,
      );
      await mkdir(directory, { recursive: true });
      journals.set(slug, path.join(directory, 'journal.jsonl'));
      await journal(slug, { phase: 'prepared', slug, commit, previousVersion });
      const output = path.join(directory, 'wrangler.jsonl');
      assertCheckout(root, commit);
      try {
        await wrangler(
          slug,
          [
            'deploy',
            '--strict',
            '--no-autoconfig',
            '--tag',
            commit.slice(0, 12),
            '--message',
            `Commit ${commit}`,
          ],
          { WRANGLER_OUTPUT_FILE_PATH: output },
        );
        const version = uploadedVersion(await readFile(output, 'utf8'), `lvbt-labs-${slug}`);
        const receipt = { version, previousVersion };
        await journal(slug, { phase: 'uploaded', ...receipt });
        return receipt;
      } catch (error) {
        await journal(slug, {
          phase: 'upload-unconfirmed',
          error: error instanceof Error ? error.message : String(error),
        });
        throw new Error(
          `Deployment could not be confirmed for ${slug}; inspect ${directory} before retrying.`,
          { cause: error },
        );
      }
    },
    async verify(slug, receipt) {
      const expected = markers.get(slug);
      if (expected === undefined) throw new Error(`No sealed build exists for ${slug}.`);
      if ((await currentVersion(slug)) !== receipt.version)
        throw new Error(`The active version changed for ${slug}.`);
      await verifyPublicArtifact(request, expected);
      await journal(slug, { phase: 'verified', ...receipt });
    },
  };
}
