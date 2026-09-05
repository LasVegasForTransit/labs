import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { isDeepStrictEqual, promisify } from 'node:util';
import ts from 'typescript';
import { z } from 'zod';

import { activeVersion, uploadedVersion, verifyArchiveVersion } from './cloudflare-release.js';
import { assertDeploymentCheckout } from './deployment-checkout.js';
import type { DeploymentOperations } from './deployment.js';
import { sealArtifact, verifyReleaseResponse, type ReleaseMarker } from './release-artifact.js';
import { readCatalogRecords } from './catalog-records.js';
import { prepareArchiveWorker } from './archive-worker.js';
import type { LabManifestV1 } from './manifest.js';
import { parseManifestSource } from './manifest-source.js';

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

function preparedWrangler(command: Run, directories: Map<string, string>) {
  return (slug: string, args: string[], env?: NodeJS.ProcessEnv) => {
    const directory = directories.get(slug);
    if (directory === undefined) throw new Error(`No prepared deployment exists for ${slug}.`);
    return command(['exec', 'wrangler', ...args], directory, env);
  };
}

async function prepareRetired(root: string, commit: string, record: LabManifestV1) {
  const { slug } = record;
  if (record.status !== 'retired')
    throw new Error(`Labs does not own deployment of graduated project ${slug}.`);
  const parent = path.join(root, '.wrangler', 'archives');
  await mkdir(parent, { recursive: true });
  const bundle = await prepareArchiveWorker(
    path.join(root, 'retired', slug),
    path.join(parent, `${slug}-${randomUUID()}`),
    commit,
  );
  if (!isDeepStrictEqual(bundle.manifest, record) || bundle.marker === undefined)
    throw new Error(`Retired catalog record ${slug} does not match its archive.`);
  return { directory: bundle.directory, marker: bundle.marker };
}

function deploymentJournal(journals: Map<string, string>) {
  return async (slug: string, entry: unknown) => {
    const file = journals.get(slug);
    if (file === undefined) throw new Error(`No deployment journal exists for ${slug}.`);
    await appendFile(file, `${JSON.stringify(entry)}\n`);
  };
}

function deploymentMessage(
  root: string,
  slug: string,
  directories: Map<string, string>,
  markers: Map<string, ReleaseMarker>,
) {
  const marker = markers.get(slug);
  if (marker === undefined) throw new Error(`No sealed build exists for ${slug}.`);
  return directories.get(slug) === path.join(root, 'apps', slug)
    ? `Commit ${marker.commit}`
    : `Archive ${marker.commit} ${marker.artifactHash}`;
}

async function retiredApp(root: string, slug: string) {
  let source: string;
  try {
    source = await readFile(path.join(root, 'apps', slug, 'lab.config.ts'), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
  const { manifest } = parseManifestSource(source, slug);
  return manifest.status === 'retired' ? manifest : undefined;
}

async function buildProjects(
  context: {
    root: string;
    commit: string;
    slugs: string[];
    command: Run;
    directories: Map<string, string>;
  },
  packages: string[],
): Promise<Map<string, ReleaseMarker>> {
  const { root, commit, slugs, command, directories } = context;
  if (packages.length > 0)
    await command(
      ['exec', 'turbo', 'run', 'build', ...packages.map((name) => `--filter=${name}`)],
      root,
    );
  const markers = new Map<string, ReleaseMarker>();
  const records = await readCatalogRecords(root);
  for (const slug of slugs) {
    const record =
      records.find((candidate) => candidate.slug === slug) ?? (await retiredApp(root, slug));
    if (record !== undefined) {
      const bundle = await prepareRetired(root, commit, record);
      directories.set(slug, bundle.directory);
      markers.set(slug, bundle.marker);
      continue;
    }
    const app = path.join(root, 'apps', slug);
    directories.set(slug, app);
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

async function verifyActiveVersion(
  current: (slug: string) => Promise<string | null>,
  slug: string,
  expected: string,
) {
  if ((await current(slug)) !== expected)
    throw new Error(`The active version changed for ${slug}.`);
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
  const directories = new Map<string, string>();
  const journals = new Map<string, string>();
  const wrangler = preparedWrangler(command, directories);
  async function currentVersion(slug: string) {
    return activeVersion(JSON.parse(await wrangler(slug, ['deployments', 'list', '--json'])));
  }
  const journal = deploymentJournal(journals);
  return {
    async build(packages) {
      markers = await buildProjects({ root, commit, slugs, command, directories }, packages);
      assertCheckout(root, commit);
    },
    async deploy(slug) {
      const message = deploymentMessage(root, slug, directories, markers);
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
            message,
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
      await verifyActiveVersion(currentVersion, slug, receipt.version);
      if (directories.get(slug) !== path.join(root, 'apps', slug))
        verifyArchiveVersion(
          JSON.parse(await wrangler(slug, ['versions', 'view', receipt.version, '--json'])),
          receipt.version,
        );
      await verifyPublicArtifact(request, expected);
      await verifyActiveVersion(currentVersion, slug, receipt.version);
      await journal(slug, { phase: 'verified', ...receipt });
    },
  };
}
