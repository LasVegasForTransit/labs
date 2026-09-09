import { z } from 'zod';
import { isDeepStrictEqual } from 'node:util';

const repository = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9-]*\/[a-zA-Z0-9][a-zA-Z0-9._-]*$/);

export const MigrationPausedHandoffV1Schema = z
  .object({
    formatVersion: z.literal(1),
    slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    repository,
    sourceCommit: z.string().regex(/^[a-f0-9]{40}$/),
    destinationCommit: z.string().regex(/^[a-f0-9]{40}$/),
    previousVersion: z.uuid(),
    phase: z.literal('labs-paused'),
  })
  .strict();

export const MigrationVerifiedHandoffV1Schema = MigrationPausedHandoffV1Schema.omit({
  phase: true,
})
  .extend({
    phase: z.literal('destination-verified'),
    destinationVersion: z.uuid(),
    artifactHash: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();

export const MigrationHandoffV1Schema = z.discriminatedUnion('phase', [
  MigrationPausedHandoffV1Schema,
  MigrationVerifiedHandoffV1Schema,
]);

export type MigrationHandoffV1 = z.infer<typeof MigrationHandoffV1Schema>;
export type MigrationPausedHandoffV1 = z.infer<typeof MigrationPausedHandoffV1Schema>;
export type MigrationVerifiedHandoffV1 = z.infer<typeof MigrationVerifiedHandoffV1Schema>;

export function parseMigrationHandoff(input: unknown, slug: string): MigrationHandoffV1 {
  const handoff = MigrationHandoffV1Schema.parse(input);
  if (handoff.slug !== slug)
    throw new Error(`Migration handoff slug "${handoff.slug}" must match "${slug}".`);
  return handoff;
}

const pauseInputSchema = z
  .object({
    slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    repository,
    sourceCommit: z.string().regex(/^[a-f0-9]{40}$/),
    apply: z.boolean(),
  })
  .strict();

const destinationSchema = z
  .object({
    commit: z.string().regex(/^[a-f0-9]{40}$/),
    deploymentOwner: z.boolean(),
    validate: z.enum(['success', 'failure', 'pending']),
  })
  .strict();
type DestinationState = z.infer<typeof destinationSchema>;

export interface MigrationPauseOperations {
  read(): Promise<MigrationHandoffV1 | null>;
  inspectDestination(): Promise<z.infer<typeof destinationSchema>>;
  activeVersion(): Promise<string>;
  guard(): void | Promise<void>;
  write(record: MigrationPausedHandoffV1): Promise<void>;
}

export interface MigrationTransferOperations {
  read(): Promise<MigrationHandoffV1 | null>;
  inspectDestination(): Promise<DestinationState>;
  guard(): void | Promise<void>;
  setDestinationOwner(enabled: boolean): Promise<void>;
  dispatch(commit: string): Promise<void>;
  journal(phase: string, details?: unknown): Promise<void>;
}

export interface MigrationVerificationOperations {
  read(): Promise<MigrationHandoffV1 | null>;
  inspectDestination(): Promise<DestinationState>;
  verifyDeployment(handoff: MigrationHandoffV1): Promise<{ version: string; artifactHash: string }>;
  guard(): void | Promise<void>;
  writeVerified(record: MigrationVerifiedHandoffV1): Promise<void>;
}

async function inspectedHandoff(
  input: z.infer<typeof pauseInputSchema>,
  operations: MigrationPauseOperations,
) {
  const destination = destinationSchema.parse(await operations.inspectDestination());
  if (destination.deploymentOwner)
    throw new Error('The destination deployment owner must not be enabled before Labs pauses.');
  if (destination.validate !== 'success')
    throw new Error('The destination commit must pass its Validate check before Labs pauses.');
  return MigrationPausedHandoffV1Schema.parse({
    formatVersion: 1,
    slug: input.slug,
    repository: input.repository,
    sourceCommit: input.sourceCommit,
    destinationCommit: destination.commit,
    previousVersion: await operations.activeVersion(),
    phase: 'labs-paused',
  });
}

function acceptedVerificationDestination(handoff: MigrationHandoffV1, raw: DestinationState) {
  const destination = acceptedDestination(handoff, raw);
  if (!destination.deploymentOwner)
    throw new Error('The destination does not own deployment for this lab.');
  return destination;
}

const deploymentVerificationSchema = z
  .object({
    version: z.uuid(),
    artifactHash: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();

function verifiedHandoff(
  handoff: MigrationHandoffV1,
  verification: z.infer<typeof deploymentVerificationSchema>,
) {
  return MigrationVerifiedHandoffV1Schema.parse({
    ...handoff,
    phase: 'destination-verified',
    destinationVersion: verification.version,
    artifactHash: verification.artifactHash,
  });
}

export async function verifyMigration(
  raw: { slug: string; apply: boolean },
  operations: MigrationVerificationOperations,
) {
  const input = z
    .object({
      slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
      apply: z.boolean(),
    })
    .strict()
    .parse(raw);
  const stored = await operations.read();
  if (stored === null) throw new Error('Pause Labs deployment ownership before verification.');
  const handoff = parseMigrationHandoff(stored, input.slug);
  acceptedVerificationDestination(handoff, await operations.inspectDestination());
  const observed = deploymentVerificationSchema.parse(await operations.verifyDeployment(handoff));
  const verified = verifiedHandoff(handoff, observed);
  if (handoff.phase === 'destination-verified') {
    if (!isDeepStrictEqual(handoff, verified))
      throw new Error('The verified destination deployment no longer matches its handoff record.');
    return {
      command: 'migrate',
      ok: true,
      changed: false,
      wouldChange: false,
      phase: 'destination-verified',
      handoff,
    };
  }
  if (!input.apply)
    return {
      command: 'migrate',
      ok: true,
      changed: false,
      wouldChange: true,
      phase: 'verification-planned',
      handoff: verified,
    };
  await operations.guard();
  acceptedVerificationDestination(handoff, await operations.inspectDestination());
  const confirmed = deploymentVerificationSchema.parse(await operations.verifyDeployment(handoff));
  if (!isDeepStrictEqual(observed, confirmed))
    throw new Error('Destination deployment changed during migration verification.');
  const record = verifiedHandoff(handoff, confirmed);
  await operations.writeVerified(record);
  return {
    command: 'migrate',
    ok: true,
    changed: true,
    wouldChange: false,
    phase: 'destination-verified',
    handoff: record,
  };
}

export async function pauseMigration(
  raw: z.infer<typeof pauseInputSchema>,
  operations: MigrationPauseOperations,
) {
  const input = pauseInputSchema.parse(raw);
  const existing = await operations.read();
  if (existing !== null) {
    const parsed = parseMigrationHandoff(existing, input.slug);
    if (parsed.repository !== input.repository || parsed.sourceCommit !== input.sourceCommit)
      throw new Error('A different migration handoff already owns this slug.');
    return {
      command: 'migrate',
      ok: true,
      changed: false,
      wouldChange: false,
      phase: 'labs-paused',
      handoff: parsed,
    };
  }
  const handoff = await inspectedHandoff(input, operations);
  if (!input.apply)
    return {
      command: 'migrate',
      ok: true,
      changed: false,
      wouldChange: true,
      phase: 'pause-planned',
      handoff,
    };
  await operations.guard();
  const confirmed = await inspectedHandoff(input, operations);
  if (!isDeepStrictEqual(handoff, confirmed))
    throw new Error('Migration state changed during pause preparation.');
  await operations.write(confirmed);
  return {
    command: 'migrate',
    ok: true,
    changed: true,
    wouldChange: false,
    phase: 'labs-paused',
    handoff: confirmed,
  };
}

function acceptedDestination(handoff: MigrationHandoffV1, raw: DestinationState) {
  const destination = destinationSchema.parse(raw);
  if (destination.commit !== handoff.destinationCommit)
    throw new Error('The destination commit changed after the Labs ownership pause.');
  if (destination.validate !== 'success')
    throw new Error('The paused destination commit no longer has a successful Validate check.');
  return destination;
}

function message(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export async function transferMigration(
  raw: { slug: string; apply: boolean },
  operations: MigrationTransferOperations,
) {
  const input = z
    .object({
      slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
      apply: z.boolean(),
    })
    .strict()
    .parse(raw);
  const stored = await operations.read();
  if (stored === null) throw new Error('Pause Labs deployment ownership before transfer.');
  const handoff = parseMigrationHandoff(stored, input.slug);
  const destination = acceptedDestination(handoff, await operations.inspectDestination());
  if (destination.deploymentOwner)
    return {
      command: 'migrate',
      ok: true,
      changed: false,
      wouldChange: false,
      phase: 'transfer-started',
      handoff,
      errors: [],
    };
  if (!input.apply)
    return {
      command: 'migrate',
      ok: true,
      changed: false,
      wouldChange: true,
      phase: 'transfer-planned',
      handoff,
      errors: [],
    };
  let enabled = false;
  try {
    await operations.guard();
    const confirmed = acceptedDestination(handoff, await operations.inspectDestination());
    if (confirmed.deploymentOwner)
      throw new Error('Destination ownership changed during transfer preparation.');
    await operations.journal('prepared', handoff);
    await operations.setDestinationOwner(true);
    enabled = true;
    const claimed = acceptedDestination(handoff, await operations.inspectDestination());
    if (!claimed.deploymentOwner)
      throw new Error('The destination ownership change was not confirmed.');
    await operations.journal('destination-enabled', handoff);
    await operations.dispatch(handoff.destinationCommit);
    await operations.journal('deployment-dispatched', handoff);
    return {
      command: 'migrate',
      ok: true,
      changed: true,
      wouldChange: false,
      phase: 'transfer-started',
      handoff,
      errors: [],
    };
  } catch (error) {
    const errors = [message(error)];
    try {
      await operations.journal(enabled ? 'transfer-unconfirmed' : 'transfer-failed', {
        handoff,
        errors,
      });
    } catch (journalError) {
      errors.push(`Migration journal failed: ${message(journalError)}`);
    }
    return {
      command: 'migrate',
      ok: false,
      changed: enabled ? null : false,
      wouldChange: false,
      phase: enabled ? 'transfer-unconfirmed' : 'transfer-failed',
      handoff,
      errors,
    };
  }
}
