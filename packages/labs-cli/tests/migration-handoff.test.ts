import { expect, test } from 'vitest';
import {
  parseMigrationHandoff,
  pauseMigration,
  rollbackMigration,
  transferMigration,
  verifyMigration,
} from '../src/migration-handoff.js';

const handoff = {
  formatVersion: 1,
  slug: 'example',
  repository: 'LasVegasForTransit/example',
  sourceCommit: 'a'.repeat(40),
  destinationCommit: 'b'.repeat(40),
  previousVersion: '11111111-1111-4111-8111-111111111111',
  phase: 'labs-paused',
} as const;

test('accepts a versioned paused-ownership record for its slug', () => {
  expect(parseMigrationHandoff(handoff, 'example')).toEqual(handoff);
});

test.each([
  [{ ...handoff, slug: 'other' }, 'example'],
  [{ ...handoff, repository: 'not a repository' }, 'example'],
  [{ ...handoff, phase: 'prepared' }, 'example'],
])('rejects an invalid or mismatched ownership record', (input, slug) => {
  expect(() => parseMigrationHandoff(input, slug)).toThrow();
});

test('plans and applies a pause only after rechecking destination acceptance', async () => {
  const events: string[] = [];
  const operations = {
    read: () => Promise.resolve(null),
    inspectDestination: () => {
      events.push('inspect');
      return Promise.resolve({
        commit: 'b'.repeat(40),
        deploymentOwner: false,
        validate: 'success' as const,
      });
    },
    activeVersion: () => {
      events.push('version');
      return Promise.resolve('11111111-1111-4111-8111-111111111111');
    },
    guard: () => {
      events.push('guard');
      return Promise.resolve();
    },
    write: (record: unknown) => {
      events.push('write');
      expect(record).toEqual(handoff);
      return Promise.resolve();
    },
  };

  const planned = await pauseMigration(
    {
      slug: 'example',
      repository: 'LasVegasForTransit/example',
      sourceCommit: 'a'.repeat(40),
      apply: false,
    },
    operations,
  );
  expect(planned).toMatchObject({ changed: false, wouldChange: true, phase: 'pause-planned' });
  expect(events).toEqual(['inspect', 'version']);

  events.length = 0;
  const applied = await pauseMigration(
    {
      slug: 'example',
      repository: 'LasVegasForTransit/example',
      sourceCommit: 'a'.repeat(40),
      apply: true,
    },
    operations,
  );
  expect(applied).toMatchObject({ changed: true, phase: 'labs-paused', handoff });
  expect(events).toEqual(['inspect', 'version', 'guard', 'inspect', 'version', 'write']);
});

test('an identical pause is idempotent and conflicting state is rejected', async () => {
  const operations = {
    read: () => Promise.resolve(handoff),
    inspectDestination: () =>
      Promise.resolve({
        commit: 'b'.repeat(40),
        deploymentOwner: false,
        validate: 'success' as const,
      }),
    activeVersion: () => Promise.resolve(handoff.previousVersion),
    guard: () => Promise.resolve(),
    write: () => Promise.reject(new Error('must not write')),
  };
  expect(
    await pauseMigration(
      {
        slug: handoff.slug,
        repository: handoff.repository,
        sourceCommit: handoff.sourceCommit,
        apply: true,
      },
      operations,
    ),
  ).toMatchObject({ changed: false, phase: 'labs-paused' });

  await expect(
    pauseMigration(
      {
        slug: handoff.slug,
        repository: 'LasVegasForTransit/different',
        sourceCommit: handoff.sourceCommit,
        apply: true,
      },
      operations,
    ),
  ).rejects.toThrow(/different migration handoff/);
});

test.each([
  [{ commit: 'b'.repeat(40), deploymentOwner: true, validate: 'success' as const }, /enabled/],
  [{ commit: 'b'.repeat(40), deploymentOwner: false, validate: 'failure' as const }, /Validate/],
])('refuses an unsafe destination before pausing Labs', async (destination, message) => {
  await expect(
    pauseMigration(
      {
        slug: handoff.slug,
        repository: handoff.repository,
        sourceCommit: handoff.sourceCommit,
        apply: true,
      },
      {
        read: () => Promise.resolve(null),
        inspectDestination: () => Promise.resolve(destination),
        activeVersion: () => Promise.resolve(handoff.previousVersion),
        guard: () => Promise.resolve(),
        write: () => Promise.resolve(),
      },
    ),
  ).rejects.toThrow(message);
});

test('enables and dispatches the reviewed destination after the committed pause', async () => {
  const events: string[] = [];
  let owner = false;
  const result = await transferMigration(
    { slug: handoff.slug, apply: true },
    {
      read: () => Promise.resolve(handoff),
      inspectDestination: () =>
        Promise.resolve({
          commit: handoff.destinationCommit,
          deploymentOwner: owner,
          validate: 'success',
        }),
      guard: () => {
        events.push('guard');
        return Promise.resolve();
      },
      setDestinationOwner: (enabled) => {
        events.push(`owner:${enabled}`);
        owner = enabled;
        return Promise.resolve();
      },
      dispatch: (commit) => {
        events.push(`dispatch:${commit}`);
        return Promise.resolve();
      },
      journal: (phase) => {
        events.push(`journal:${phase}`);
        return Promise.resolve();
      },
    },
  );
  expect(result).toMatchObject({ ok: true, changed: true, phase: 'transfer-started' });
  expect(events).toEqual([
    'guard',
    'journal:prepared',
    'owner:true',
    'journal:destination-enabled',
    `dispatch:${handoff.destinationCommit}`,
    'journal:deployment-dispatched',
  ]);
});

test('transfer dry run has no writes and rejects a changed destination commit', async () => {
  const operations = {
    read: () => Promise.resolve(handoff),
    inspectDestination: () =>
      Promise.resolve({
        commit: handoff.destinationCommit,
        deploymentOwner: false,
        validate: 'success' as const,
      }),
    guard: () => Promise.reject(new Error('must not guard')),
    setDestinationOwner: () => Promise.reject(new Error('must not write')),
    dispatch: () => Promise.reject(new Error('must not dispatch')),
    journal: () => Promise.reject(new Error('must not journal')),
  };
  await expect(
    transferMigration({ slug: handoff.slug, apply: false }, operations),
  ).resolves.toMatchObject({
    ok: true,
    changed: false,
    wouldChange: true,
    phase: 'transfer-planned',
  });
  await expect(
    transferMigration(
      { slug: handoff.slug, apply: false },
      {
        ...operations,
        inspectDestination: () =>
          Promise.resolve({
            commit: 'c'.repeat(40),
            deploymentOwner: false,
            validate: 'success',
          }),
      },
    ),
  ).rejects.toThrow(/commit changed/);
});

test('transfer reports an unconfirmed partial change when dispatch fails', async () => {
  let owner = false;
  const result = await transferMigration(
    { slug: handoff.slug, apply: true },
    {
      read: () => Promise.resolve(handoff),
      inspectDestination: () =>
        Promise.resolve({
          commit: handoff.destinationCommit,
          deploymentOwner: owner,
          validate: 'success',
        }),
      guard: () => Promise.resolve(),
      setDestinationOwner: () => {
        owner = true;
        return Promise.resolve();
      },
      dispatch: () => Promise.reject(new Error('dispatch failed')),
      journal: () => Promise.resolve(),
    },
  );
  expect(result).toMatchObject({ ok: false, changed: null, phase: 'transfer-unconfirmed' });
  expect(result.errors).toEqual(['dispatch failed']);
});

test('records the exact destination version only after stable-route verification', async () => {
  const verified = {
    ...handoff,
    phase: 'destination-verified' as const,
    destinationVersion: '22222222-2222-4222-8222-222222222222',
    artifactHash: 'c'.repeat(64),
  };
  const events: string[] = [];
  const result = await verifyMigration(
    { slug: handoff.slug, apply: true },
    {
      read: () => Promise.resolve(handoff),
      inspectDestination: () =>
        Promise.resolve({
          commit: handoff.destinationCommit,
          deploymentOwner: true,
          validate: 'success',
        }),
      verifyDeployment: () => {
        events.push('verify');
        return Promise.resolve({
          version: verified.destinationVersion,
          artifactHash: verified.artifactHash,
        });
      },
      guard: () => {
        events.push('guard');
        return Promise.resolve();
      },
      writeVerified: (record) => {
        events.push('write');
        expect(record).toEqual(verified);
        return Promise.resolve();
      },
    },
  );
  expect(result).toMatchObject({ ok: true, changed: true, phase: 'destination-verified' });
  expect(events).toEqual(['verify', 'guard', 'verify', 'write']);
});

test('verification refuses a destination that does not own deployment', async () => {
  await expect(
    verifyMigration(
      { slug: handoff.slug, apply: false },
      {
        read: () => Promise.resolve(handoff),
        inspectDestination: () =>
          Promise.resolve({
            commit: handoff.destinationCommit,
            deploymentOwner: false,
            validate: 'success',
          }),
        verifyDeployment: () =>
          Promise.resolve({
            version: '22222222-2222-4222-8222-222222222222',
            artifactHash: 'c'.repeat(64),
          }),
        guard: () => Promise.resolve(),
        writeVerified: () => Promise.resolve(),
      },
    ),
  ).rejects.toThrow(/does not own/);
});

test('rollback disables the destination before restoring the retained Labs version', async () => {
  const events: string[] = [];
  let owner = true;
  const result = await rollbackMigration(
    { slug: handoff.slug, apply: true },
    {
      read: () => Promise.resolve(handoff),
      inspectDestination: () =>
        Promise.resolve({
          commit: handoff.destinationCommit,
          deploymentOwner: owner,
          validate: 'success',
        }),
      guard: () => {
        events.push('guard');
        return Promise.resolve();
      },
      setDestinationOwner: (enabled) => {
        events.push(`owner:${enabled}`);
        owner = enabled;
        return Promise.resolve();
      },
      restore: (record) => {
        events.push(`restore:${record.previousVersion}`);
        return Promise.resolve();
      },
      verifyRestored: () => {
        events.push('verify');
        return Promise.resolve();
      },
      removeHandoff: () => {
        events.push('remove');
        return Promise.resolve();
      },
      journal: (phase) => {
        events.push(`journal:${phase}`);
        return Promise.resolve();
      },
    },
  );
  expect(result).toMatchObject({ ok: true, changed: true, phase: 'rolled-back' });
  expect(events).toEqual([
    'guard',
    'journal:prepared',
    'owner:false',
    'journal:destination-disabled',
    `restore:${handoff.previousVersion}`,
    'verify',
    'remove',
    'journal:rolled-back',
  ]);
});

test('rollback dry run leaves both deployment owners unchanged', async () => {
  let mutated = false;
  const result = await rollbackMigration(
    { slug: handoff.slug, apply: false },
    {
      read: () => Promise.resolve(handoff),
      inspectDestination: () =>
        Promise.resolve({
          commit: handoff.destinationCommit,
          deploymentOwner: true,
          validate: 'success',
        }),
      guard: () => Promise.resolve(),
      setDestinationOwner: () => {
        mutated = true;
        return Promise.resolve();
      },
      restore: () => {
        mutated = true;
        return Promise.resolve();
      },
      verifyRestored: () => Promise.resolve(),
      removeHandoff: () => {
        mutated = true;
        return Promise.resolve();
      },
      journal: () => Promise.resolve(),
    },
  );
  expect(result).toMatchObject({ changed: false, wouldChange: true, phase: 'rollback-planned' });
  expect(mutated).toBe(false);
});
