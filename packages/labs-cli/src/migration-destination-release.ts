import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { z } from 'zod';
import {
  releaseIdentitySchema,
  resolveRelease,
  verifyRelease,
  verifyReleaseAttestation,
  verifyWorkerReleaseConfiguration,
  type ReleaseIdentity,
} from '@lasvegasfortransit/web-platform/release';
import type { MigrationHandoffV1 } from './migration-handoff.js';
import type { GitHub } from './migration-handoff-operations.js';

const stagingWorkflow = {
  name: 'Deploy staging',
  path: '.github/workflows/deploy.yml',
  branch: 'main',
};
export type DestinationArtifact = (
  handoff: MigrationHandoffV1,
  identity: ReleaseIdentity,
) => Promise<string>;

function destinationPolicy(handoff: MigrationHandoffV1, github: GitHub) {
  const repository = handoff.repository;
  const source = z
    .object({ content: z.string(), encoding: z.literal('base64') })
    .parse(
      JSON.parse(
        github([
          'api',
          `repos/${repository}/contents/.lvbt/tooling.json?ref=${handoff.destinationCommit}`,
        ]),
      ),
    );
  const policy = z
    .object({
      release: z.object({
        attestation: z.object({
          signerWorkflow: z.literal(
            'LasVegasForTransit/repository-tooling/.github/workflows/release-attest.yml',
          ),
          signerCommit: z.string().regex(/^[a-f0-9]{40}$/),
        }),
      }),
    })
    .parse(JSON.parse(Buffer.from(source.content, 'base64').toString('utf8')));
  return policy;
}

export async function destinationArtifact(
  handoff: MigrationHandoffV1,
  identity: ReleaseIdentity,
  github: GitHub,
): Promise<string> {
  const repository = handoff.repository;
  const resolved = await resolveRelease(
    repository,
    identity.releaseId,
    {
      previewIdentity: () => Promise.resolve(identity),
      getRun: (id) =>
        Promise.resolve(JSON.parse(github(['api', `repos/${repository}/actions/runs/${id}`]))),
      getArtifacts: (id) =>
        Promise.resolve(
          JSON.parse(github(['api', `repos/${repository}/actions/runs/${id}/artifacts`])),
        ),
    },
    { artifactPrefix: 'app-release', stagingWorkflow },
  );
  if (resolved.commit !== handoff.destinationCommit || resolved.commit !== identity.commit)
    throw new Error('Destination source run differs from the reviewed source commit.');
  const policy = destinationPolicy(handoff, github);
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'lvbt-destination-proof-'));
  try {
    const directory = path.join(temporary, 'release');
    const proof = path.join(temporary, 'proof');
    for (const [name, destination] of [
      [`app-release-${identity.releaseId}`, directory],
      [`attestation-app-release-${identity.releaseId}`, proof],
    ]) {
      if (!name || !destination) throw new Error('Missing retained destination artifact name.');
      github([
        'run',
        'download',
        identity.releaseId,
        '--repo',
        repository,
        '--name',
        name,
        '--dir',
        destination,
      ]);
    }
    const saved = await verifyRelease(directory);
    if (
      saved.commit !== handoff.destinationCommit ||
      saved.releaseId !== identity.releaseId ||
      saved.app !== handoff.slug
    )
      throw new Error(
        'The retained destination artifact differs from the reviewed source and public identity.',
      );
    await verifyWorkerReleaseConfiguration(directory, {
      productionWorker: `lvbt-labs-${handoff.slug}`,
      previewWorker: `lvbt-labs-${handoff.slug}-staging`,
    });
    await verifyReleaseAttestation(
      {
        repository,
        artifactPrefix: 'app-release',
        stagingWorkflow,
        attestation: policy.release.attestation,
      },
      directory,
      proof,
    );
    return saved.artifactHash;
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

export async function sharedDestinationHash(
  handoff: MigrationHandoffV1,
  value: unknown,
  message: string,
  artifact: DestinationArtifact,
): Promise<string> {
  const identity = releaseIdentitySchema.parse(value);
  if (identity.app !== handoff.slug || identity.commit !== handoff.destinationCommit)
    throw new Error('The destination release marker belongs to another app or source commit.');
  if (message !== `Release ${identity.releaseId} at ${identity.commit}`)
    throw new Error('The active destination version lacks retained release provenance.');
  return z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .parse(await artifact(handoff, identity));
}

export const legacyReleaseSchema = z
  .object({
    formatVersion: z.literal(1),
    slug: z.string(),
    commit: z.string().regex(/^[a-f0-9]{40}$/),
    artifactHash: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
