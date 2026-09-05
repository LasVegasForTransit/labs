import { z } from 'zod';

export const rollbackSchema = z
  .object({
    slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    version: z.uuid(),
    expectedVersion: z.uuid(),
    commit: z.string().regex(/^[a-f0-9]{40}$/),
    reason: z.string().trim().min(1).max(120),
    apply: z.boolean(),
  })
  .strict();
export type RollbackInput = z.infer<typeof rollbackSchema>;
export interface RollbackOperations {
  inspect(input: RollbackInput): Promise<{ activeVersion: string | null }>;
  journal(phase: string, details: unknown): Promise<void>;
  guard?(input: RollbackInput): void | Promise<void>;
  activate(input: RollbackInput): Promise<void>;
  verify(input: RollbackInput): Promise<void>;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function rollbackWorker(raw: RollbackInput, operations: RollbackOperations) {
  const input = rollbackSchema.parse(raw);
  const current = await operations.inspect(input);
  const alreadyRestored = current.activeVersion === input.version;
  if (!alreadyRestored && current.activeVersion !== input.expectedVersion)
    throw new Error('The active deployment changed; inspect it before retrying rollback.');
  const result = {
    command: 'rollback',
    slug: input.slug,
    version: input.version,
    previousVersion: current.activeVersion,
  };
  if (!input.apply)
    return { ...result, ok: true, changed: false, wouldChange: !alreadyRestored, errors: [] };
  let attempted = false;
  try {
    if (!alreadyRestored) {
      await operations.journal('prepared', input);
      await operations.guard?.(input);
      if ((await operations.inspect(input)).activeVersion !== input.expectedVersion)
        throw new Error('The active deployment changed during rollback preparation.');
      attempted = true;
      await operations.activate(input);
      await operations.journal('activated', input);
    }
    await operations.verify(input);
    if (attempted) await operations.journal('verified', input);
    return { ...result, ok: true, changed: attempted, errors: [] };
  } catch (error) {
    const errors = [errorMessage(error)];
    try {
      await operations.journal(attempted ? 'unconfirmed' : 'failed', { input, errors });
    } catch {
      errors.push(
        'The rollback journal could not be updated. Inspect the active deployment before retrying.',
      );
    }
    return { ...result, ok: false, changed: attempted ? null : false, errors };
  }
}
