import { execFile, execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { z } from 'zod';
import { activeVersion, verifyArchiveVersion } from '@lvbt/web-platform/cloudflare';
import { assertDeploymentCheckout } from '@lvbt/web-platform/release';
import type { LabManifestV1 } from './manifest.js';
import type { RollbackInput, RollbackOperations } from './rollback.js';

type Run = (args: string[]) => Promise<string>;
export function rollbackCloudflare(
  root: string,
  manifest: LabManifestV1,
  dependencies: {
    run?: Run;
    fetch?: typeof fetch;
    guard?: () => void;
    wait?: (milliseconds: number) => Promise<void>;
  } = {},
): RollbackOperations {
  const worker = `lvbt-labs-${manifest.slug}`;
  const run: Run =
    dependencies.run ??
    (async (args) =>
      (
        await promisify(execFile)('pnpm', ['exec', 'wrangler', ...args, '--name', worker], {
          cwd: root,
          env: { ...process.env, WRANGLER_LOG_SANITIZE: 'true' },
          maxBuffer: 16 * 1024 * 1024,
          timeout: 120000,
        })
      ).stdout);
  const request = dependencies.fetch ?? fetch;
  const wait =
    dependencies.wait ??
    ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const guard =
    dependencies.guard ??
    (() =>
      assertDeploymentCheckout(
        root,
        execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
      ));
  const directory = path.join(root, '.wrangler', 'rollbacks', `${manifest.slug}-${randomUUID()}`);
  let artifactHash: string | undefined;
  const current = async () =>
    activeVersion(JSON.parse(await run(['deployments', 'list', '--json'])));
  return {
    async inspect(input) {
      if (
        input.slug !== manifest.slug ||
        !['active', 'deprecated', 'retired'].includes(manifest.status)
      )
        throw new Error('Rollback requires a project deployed and owned by Labs.');
      const version: unknown = JSON.parse(await run(['versions', 'view', input.version, '--json']));
      z.object({ id: z.literal(input.version) }).parse(version);
      if (manifest.status === 'retired') verifyArchiveVersion(version, input.version);
      artifactHash = rollbackTargetHash(version, input, manifest.status === 'retired');
      return { activeVersion: await current() };
    },
    async journal(phase, details) {
      await mkdir(directory, { recursive: true });
      await appendFile(
        path.join(directory, 'journal.jsonl'),
        `${JSON.stringify({ phase, worker, details })}\n`,
      );
    },
    guard,
    async activate(input) {
      await run([
        'versions',
        'deploy',
        `${input.version}@100%`,
        '--yes',
        '--message',
        input.reason,
      ]);
    },
    async verify(input) {
      if ((await current()) !== input.version)
        throw new Error('The requested rollback version is not active.');
      await verifyRollbackRoute(request, input, artifactHash, wait);
      if ((await current()) !== input.version)
        throw new Error('The active version changed during route verification.');
    },
  };
}

export function rollbackTargetHash(version: unknown, input: RollbackInput, archive: boolean) {
  const parsed = z
    .object({ annotations: z.object({ 'workers/message': z.string() }) })
    .safeParse(version);
  if (!parsed.success) throw new Error('The target version has no standard release provenance.');
  const message = parsed.data.annotations['workers/message'];
  if (!archive && message === `Commit ${input.commit}`) return undefined;
  const prefix = `Archive ${input.commit} `;
  if (archive && message.startsWith(prefix) && /^[a-f0-9]{64}$/.test(message.slice(prefix.length)))
    return message.slice(prefix.length);
  throw new Error(
    'The target version does not match the requested release kind and source commit.',
  );
}

async function verifyRollbackRoute(
  request: typeof fetch,
  input: RollbackInput,
  artifactHash?: string,
  wait: (milliseconds: number) => Promise<void> = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)),
) {
  const base = `https://labs.lasvegasfortransit.org/${input.slug === 'home' ? '' : `${input.slug}/`}`;
  const options = {
    redirect: 'manual' as const,
    cache: 'no-store' as const,
    signal: AbortSignal.timeout(15000),
  };
  const target = { base, options, input, artifactHash };
  let lastError = 'The rollback route does not serve the requested source commit.';
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const markerError = await rollbackMarkerError(request, target);
    lastError = markerError ?? (await rollbackPageError(request, base, options));
    if (lastError === '') return;
    if (attempt < 11) await wait(5000);
  }
  throw new Error(lastError);
}

function retryableStatus(status: number) {
  return status === 404 || status === 429 || status >= 500;
}

async function rollbackMarkerError(
  request: typeof fetch,
  target: {
    base: string;
    options: RequestInit;
    input: RollbackInput;
    artifactHash: string | undefined;
  },
) {
  const { base, options, input, artifactHash } = target;
  const marker = await request(`${base}lvbt-release.json?commit=${input.commit}`, options);
  if (marker.status !== 200) {
    const message = `Rollback release marker returned HTTP ${marker.status}.`;
    if (!retryableStatus(marker.status)) throw new Error(message);
    return message;
  }
  const parsed = z
    .object({
      formatVersion: z.literal(1),
      slug: z.literal(input.slug),
      commit: z.literal(input.commit),
      artifactHash: z.string().regex(/^[a-f0-9]{64}$/),
    })
    .safeParse(await marker.json());
  if (!parsed.success) return 'The rollback route does not serve the requested source commit.';
  if (artifactHash !== undefined && parsed.data.artifactHash !== artifactHash)
    return 'The rollback route does not serve the recorded retirement archive.';
  return null;
}

async function rollbackPageError(request: typeof fetch, base: string, options: RequestInit) {
  const page = await request(base, { ...options, signal: AbortSignal.timeout(15000) });
  if (page.status === 200) return '';
  const message = `Rollback project page returned HTTP ${page.status}.`;
  if (!retryableStatus(page.status)) throw new Error(message);
  return message;
}
