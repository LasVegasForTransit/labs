import { execFile, execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { z } from 'zod';
import { activeVersion, verifyArchiveVersion } from './cloudflare-release.js';
import { assertDeploymentCheckout } from './deployment-checkout.js';
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
      await verifyRollbackRoute(request, input, artifactHash);
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
) {
  const base = `https://labs.lasvegasfortransit.org/${input.slug === 'home' ? '' : `${input.slug}/`}`;
  const options = {
    redirect: 'manual' as const,
    cache: 'no-store' as const,
    signal: AbortSignal.timeout(15000),
  };
  const marker = await request(`${base}lvbt-release.json?commit=${input.commit}`, options);
  if (marker.status !== 200)
    throw new Error(`Rollback release marker returned HTTP ${marker.status}.`);
  const parsed = z
    .object({
      formatVersion: z.literal(1),
      slug: z.literal(input.slug),
      commit: z.literal(input.commit),
      artifactHash: z.string().regex(/^[a-f0-9]{64}$/),
    })
    .safeParse(await marker.json());
  if (!parsed.success)
    throw new Error('The rollback route does not serve the requested source commit.');
  if (artifactHash !== undefined && parsed.data.artifactHash !== artifactHash)
    throw new Error('The rollback route does not serve the recorded retirement archive.');
  const page = await request(base, { ...options, signal: AbortSignal.timeout(15000) });
  if (page.status !== 200) throw new Error(`Rollback project page returned HTTP ${page.status}.`);
}
