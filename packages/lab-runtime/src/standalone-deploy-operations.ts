import { execFile, execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { z } from 'zod';
import { activeVersion, uploadedVersion } from '@lvbt/web-platform/cloudflare';
import {
  assertDeploymentCheckout,
  sealArtifact,
  verifyReleaseResponse,
  type ReleaseMarker,
} from '@lvbt/web-platform/release';
import type { StandaloneDeploymentOperations } from './standalone-deploy.js';

type Run = (args: string[], cwd: string, environment?: NodeJS.ProcessEnv) => Promise<string>;

interface Dependencies {
  run?: Run;
  fetch?: typeof fetch;
  guard?: () => void | Promise<void>;
}

const versionSchema = z.object({
  id: z.uuid(),
  annotations: z.object({ 'workers/message': z.string() }),
});

function defaultRun(args: string[], cwd: string, environment?: NodeJS.ProcessEnv) {
  return promisify(execFile)('pnpm', args, {
    cwd,
    env: { ...process.env, ...environment, WRANGLER_LOG_SANITIZE: 'true' },
    maxBuffer: 16 * 1024 * 1024,
    timeout: 120000,
  }).then(({ stdout }) => stdout);
}

async function publicVerification(
  request: typeof fetch,
  marker: ReleaseMarker,
  current: () => Promise<string | null>,
  version: string,
) {
  if ((await current()) !== version) throw new Error('The standalone version is not active.');
  const base = `https://labs.lasvegasfortransit.org/${marker.slug}/`;
  const options = {
    redirect: 'manual' as const,
    cache: 'no-store' as const,
    signal: AbortSignal.timeout(15000),
  };
  await verifyReleaseResponse(
    await request(`${base}lvbt-release.json?commit=${marker.commit}`, options),
    marker,
  );
  const page = await request(base, { ...options, signal: AbortSignal.timeout(15000) });
  if (page.status !== 200) throw new Error(`The standalone project returned HTTP ${page.status}.`);
  if ((await current()) !== version)
    throw new Error('The active version changed during standalone route verification.');
}

export function standaloneDeploymentOperations(
  root: string,
  slug: string,
  commit: string,
  dependencies: Dependencies = {},
): StandaloneDeploymentOperations {
  const app = path.join(root, 'apps', slug);
  const run = dependencies.run ?? defaultRun;
  const request = dependencies.fetch ?? fetch;
  const guard =
    dependencies.guard ??
    (() => {
      const head = execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: root,
        encoding: 'utf8',
      }).trim();
      if (process.env.GITHUB_SHA?.trim() !== undefined && process.env.GITHUB_SHA.trim() !== head)
        throw new Error('The standalone checkout does not match the triggering commit.');
      assertDeploymentCheckout(root, commit);
    });
  const directory = path.join(root, '.wrangler', 'deployments', `${commit}-${randomUUID()}`);
  const output = path.join(directory, 'wrangler.jsonl');
  const journal = path.join(directory, 'journal.jsonl');
  const wrangler = (args: string[], environment?: NodeJS.ProcessEnv) =>
    run(['exec', 'wrangler', ...args], app, environment);
  const current = async () =>
    activeVersion(JSON.parse(await wrangler(['deployments', 'list', '--json'])));
  return {
    build: () => run(['build'], root).then(() => undefined),
    guard,
    seal: () => sealArtifact(path.join(app, 'dist'), { slug, commit }),
    activeVersion: current,
    async upload(_marker, dryRun) {
      await mkdir(directory, { recursive: true });
      const args = [
        'deploy',
        '--strict',
        '--no-autoconfig',
        '--tag',
        commit.slice(0, 12),
        '--message',
        `Commit ${commit}`,
        ...(dryRun ? ['--dry-run'] : []),
      ];
      await wrangler(args, dryRun ? undefined : { WRANGLER_OUTPUT_FILE_PATH: output });
      return dryRun ? null : uploadedVersion(await readFile(output, 'utf8'), `lvbt-labs-${slug}`);
    },
    async verify(marker, version) {
      const details = versionSchema.parse(
        JSON.parse(await wrangler(['versions', 'view', version, '--json'])),
      );
      if (details.id !== version || details.annotations['workers/message'] !== `Commit ${commit}`)
        throw new Error('The active Worker version lacks standalone release provenance.');
      await publicVerification(request, marker, current, version);
    },
    async journal(phase, details) {
      await mkdir(directory, { recursive: true });
      await appendFile(journal, `${JSON.stringify({ phase, details })}\n`);
    },
  };
}
