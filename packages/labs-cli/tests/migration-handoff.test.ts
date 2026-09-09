import { expect, test } from 'vitest';
import { parseMigrationHandoff, pauseMigration } from '../src/migration-handoff.js';

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
