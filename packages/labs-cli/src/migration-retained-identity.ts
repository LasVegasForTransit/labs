import { z } from 'zod';
import type { MigrationHandoffV1, MigrationPauseOperations } from './migration-handoff.js';

export const retainedRecoverySchema = z.strictObject({
  releaseId: z.string().regex(/^[1-9][0-9]*$/u),
  commit: z.string().regex(/^[a-f0-9]{40}$/u),
});
export async function captureMigrationRecovery(operations: MigrationPauseOperations) {
  const previousVersion = await operations.activeVersion();
  const previousRelease = await operations.activeRelease?.();
  if (previousRelease && (await operations.activeVersion()) !== previousVersion)
    throw new Error('Labs deployment changed while capturing retained recovery identity.');
  return { previousVersion, ...(previousRelease ? { previousRelease } : {}) };
}

export function migrationRecoveryVersion(handoff: MigrationHandoffV1): string {
  return handoff.phase === 'destination-verified'
    ? handoff.destinationVersion
    : handoff.previousVersion;
}
