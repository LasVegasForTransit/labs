import { appendFile, mkdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import {
  readReleaseConfiguration,
  readReleaseIdentity,
} from '@lasvegasfortransit/web-platform/release';
import { activeVersion } from '@lasvegasfortransit/web-platform/cloudflare';
import { migrationRecoveryVersion } from './migration-retained-identity.js';
import { publishRetainedLab } from './retained-publication.js';
import type { MigrationHandoffV1, MigrationRollbackOperations } from './migration-handoff.js';
import {
  defaultGitHub,
  defaultWrangler,
  inspectDestination,
  migrationVerificationGuard,
  readHandoff,
  type MigrationProviderDependencies,
} from './migration-handoff-operations.js';

function recoveryIdentity(handoff: MigrationHandoffV1) {
  if (!handoff.previousRelease)
    throw new Error(
      'Legacy version-only handoff has no verified retained source run. Reconcile its recovery artifact and record the verified run before changing deployment ownership; baseline evidence is not saved release bytes.',
    );
  return handoff.previousRelease;
}
async function verifyRestored(
  root: string,
  slug: string,
  handoff: MigrationHandoffV1,
  request?: typeof fetch,
) {
  const expected = recoveryIdentity(handoff);
  const config = await readReleaseConfiguration(root, process.env, slug);
  const identity = await readReleaseIdentity(config.productionUrl, {
    publicPath: config.publicPath,
    app: slug,
    ...(request ? { request } : {}),
  });
  if (identity.releaseId !== expected.releaseId || identity.commit !== expected.commit)
    throw new Error(
      'The public Labs route does not serve the verified retained recovery artifact.',
    );
}
async function currentRecoveryVersion(
  root: string,
  slug: string,
  handoff: MigrationHandoffV1,
  wrangler: NonNullable<MigrationProviderDependencies['wrangler']>,
): Promise<string> {
  const config = await readReleaseConfiguration(root, process.env, slug);
  const expectedVersion = migrationRecoveryVersion(handoff);
  const current = activeVersion(
    JSON.parse(
      await wrangler(['deployments', 'list', '--json', '--name', config.productionWorker]),
    ),
  );
  if (current !== expectedVersion)
    throw new Error(
      'Labs deployment changed from its recorded handoff phase; reconcile before recovery.',
    );
  return expectedVersion;
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
  const promote = dependencies.promote ?? publishRetainedLab;
  const read = () => readHandoff(file, slug);
  return {
    read,
    async inspectDestination() {
      const handoff = await read();
      if (!handoff) throw new Error('No migration handoff exists for rollback.');
      recoveryIdentity(handoff);
      return inspectDestination(github, handoff);
    },
    guard: dependencies.guard ?? migrationVerificationGuard(root, slug, read),
    async setDestinationOwner(enabled) {
      const handoff = await read();
      if (!handoff) throw new Error('No migration handoff exists for rollback.');
      recoveryIdentity(handoff);
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
      const release = recoveryIdentity(handoff);
      if (!isDeepStrictEqual(await read(), handoff))
        throw new Error('Migration handoff changed; reconcile before recovery.');
      const expectedVersion = await currentRecoveryVersion(root, slug, handoff, wrangler);
      const result = await promote(
        root,
        {
          app: slug,
          runId: release.releaseId,
          commit: release.commit,
          expectedVersion,
          reason: 'Restore paused Labs deployment ownership',
          apply: true,
        },
        {
          destinationOwner: (repository) =>
            Promise.resolve(
              github(['variable', 'get', 'LVBT_DEPLOYMENT_OWNER', '--repo', repository]),
            ),
        },
      );
      if (!result.ok)
        throw new Error(
          `Retained recovery unconfirmed; inspect ${result.journal ?? 'the shared promotion run'} before retrying. ${result.errors.join(' ')}`,
        );
    },
    verifyRestored(handoff) {
      return verifyRestored(root, slug, handoff, dependencies.fetch);
    },
    async removeHandoff(handoff) {
      if (!isDeepStrictEqual(await read(), handoff))
        throw new Error('Migration handoff changed during rollback.');
      await unlink(file);
    },
    async journal(phase, details) {
      await mkdir(path.dirname(journal), { recursive: true });
      await appendFile(journal, `${JSON.stringify({ phase, details })}\n`);
    },
  };
}
