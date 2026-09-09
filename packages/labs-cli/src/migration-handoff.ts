import { z } from 'zod';
import { isDeepStrictEqual } from 'node:util';

const repository = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9-]*\/[a-zA-Z0-9][a-zA-Z0-9._-]*$/);

export const MigrationHandoffV1Schema = z
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

export type MigrationHandoffV1 = z.infer<typeof MigrationHandoffV1Schema>;

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

export interface MigrationPauseOperations {
  read(): Promise<MigrationHandoffV1 | null>;
  inspectDestination(): Promise<z.infer<typeof destinationSchema>>;
  activeVersion(): Promise<string>;
  guard(): void | Promise<void>;
  write(record: MigrationHandoffV1): Promise<void>;
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
  return MigrationHandoffV1Schema.parse({
    formatVersion: 1,
    slug: input.slug,
    repository: input.repository,
    sourceCommit: input.sourceCommit,
    destinationCommit: destination.commit,
    previousVersion: await operations.activeVersion(),
    phase: 'labs-paused',
  });
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
