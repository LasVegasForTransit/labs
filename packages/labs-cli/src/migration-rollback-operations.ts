import { appendFile, mkdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import { activeVersion } from '@lvbt/web-platform/cloudflare';
import { verifyReleaseResponse } from '@lvbt/web-platform/release';
import type { MigrationHandoffV1, MigrationRollbackOperations } from './migration-handoff.js';
import {
  defaultGitHub,
  defaultWrangler,
  inspectDestination,
  migrationVerificationGuard,
  readHandoff,
  type MigrationProviderDependencies,
  type Wrangler,
} from './migration-handoff-operations.js';

const releaseSchema = z
  .object({
    formatVersion: z.literal(1),
    slug: z.string(),
    commit: z.string().regex(/^[a-f0-9]{40}$/),
    artifactHash: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();

async function verifyRestoredRoute(
  slug: string,
  handoff: MigrationHandoffV1,
  wrangler: Wrangler,
  request: typeof fetch,
) {
  const worker = `lvbt-labs-${slug}`;
  const current = async () =>
    activeVersion(JSON.parse(await wrangler(['deployments', 'list', '--json', '--name', worker])));
  if ((await current()) !== handoff.previousVersion)
    throw new Error('The retained Labs version is not active after rollback.');
  const base = `https://labs.lasvegasfortransit.org/${slug}/`;
  const options = {
    redirect: 'manual' as const,
    cache: 'no-store' as const,
    signal: AbortSignal.timeout(15000),
  };
  const response = await request(
    `${base}lvbt-release.json?commit=${handoff.sourceCommit}`,
    options,
  );
  const marker = releaseSchema.parse(await response.clone().json());
  await verifyReleaseResponse(response, {
    formatVersion: 1,
    slug,
    commit: handoff.sourceCommit,
    artifactHash: marker.artifactHash,
  });
  const page = await request(base, { ...options, signal: AbortSignal.timeout(15000) });
  if (page.status !== 200)
    throw new Error(`The restored Labs project returned HTTP ${page.status}.`);
  if ((await current()) !== handoff.previousVersion)
    throw new Error('The active Labs version changed during rollback verification.');
}

export function migrationRollbackOperations(
  root: string,
  slug: string,
  dependencies: MigrationProviderDependencies = {},
): MigrationRollbackOperations {
  const file = path.join(root, 'migrations', `${slug}.json`);
  const journal = path.join(root, '.wrangler', 'migrations', `${slug}.jsonl`);
  const github = dependencies.github ?? defaultGitHub(root);
  const wrangler = dependencies.wrangler ?? defaultWrangler(root);
  const request = dependencies.fetch ?? fetch;
  const read = () => readHandoff(file, slug);
  return {
    read,
    async inspectDestination() {
      const handoff = await read();
      if (handoff === null) throw new Error('No migration handoff exists for rollback.');
      return inspectDestination(github, handoff);
    },
    guard: dependencies.guard ?? migrationVerificationGuard(root, slug, read),
    async setDestinationOwner(enabled) {
      const handoff = await read();
      if (handoff === null) throw new Error('No migration handoff exists for rollback.');
      github([
        'variable',
        'set',
        'LVBT_DEPLOYMENT_OWNER',
        '--body',
        String(enabled),
        '--repo',
        handoff.repository,
      ]);
    },
    async restore(handoff) {
      await wrangler([
        'versions',
        'deploy',
        handoff.previousVersion,
        '--yes',
        '--name',
        `lvbt-labs-${slug}`,
        '--message',
        `Migration rollback to ${handoff.sourceCommit}`,
      ]);
    },
    verifyRestored(handoff) {
      return verifyRestoredRoute(slug, handoff, wrangler, request);
    },
    async removeHandoff(handoff) {
      const current = await read();
      if (!isDeepStrictEqual(current, handoff))
        throw new Error('Migration handoff changed during rollback.');
      await unlink(file);
    },
    async journal(phase, details) {
      await mkdir(path.dirname(journal), { recursive: true });
      await appendFile(journal, `${JSON.stringify({ phase, details })}\n`);
    },
  };
}
