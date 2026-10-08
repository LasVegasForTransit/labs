import { expect, test } from 'vitest';
import { captureMigrationRecovery } from '../src/migration-retained-identity.js';
import type { MigrationPauseOperations } from '../src/migration-handoff.js';
const version = '1c4deaba-ee53-4c3f-ba65-176ae596cad5';
const operations: MigrationPauseOperations = {
  read: () => Promise.resolve(null),
  inspectDestination: () =>
    Promise.resolve({ commit: 'a'.repeat(40), deploymentOwner: false, validate: 'success' }),
  activeVersion: () => Promise.resolve(version),
  activeRelease: () => Promise.resolve({ commit: 'b'.repeat(40), releaseId: '123' }),
  guard() {},
  write: () => Promise.resolve(),
};

test('new handoff captures the actual retained production run independently of the export source commit', async () => {
  expect(await captureMigrationRecovery(operations)).toEqual({
    previousVersion: version,
    previousRelease: { commit: 'b'.repeat(40), releaseId: '123' },
  });
});
test('a changed deployment during capture cannot be stored as a valid recovery identity', async () => {
  let reads = 0;
  await expect(
    captureMigrationRecovery({
      ...operations,
      activeVersion: () =>
        Promise.resolve(reads++ ? '2ae50b24-3d42-48d2-a784-627b60841961' : version),
    }),
  ).rejects.toThrow(/changed/);
});
