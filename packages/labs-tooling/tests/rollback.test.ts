import { expect, test } from 'vitest';
import { rollbackWorker, type RollbackOperations } from '../src/rollback.js';

const target = '2ae50b24-3d42-48d2-a784-627b60841961';
const current = '1c4deaba-ee53-4c3f-ba65-176ae596cad5';
const input = {
  slug: 'map',
  version: target,
  expectedVersion: current,
  commit: 'a'.repeat(40),
  reason: 'Restore working route labels',
  apply: true,
};

function fixture(failure?: string) {
  let active = current;
  const events: string[] = [];
  const operations: RollbackOperations = {
    inspect() {
      events.push('inspect');
      return Promise.resolve({ activeVersion: active });
    },
    journal(phase) {
      events.push(phase);
      return Promise.resolve();
    },
    activate() {
      events.push('activate');
      active = target;
      if (failure === 'activate') return Promise.reject(new Error('Upload unconfirmed'));
      return Promise.resolve();
    },
    verify() {
      events.push('verify');
      if (failure === 'verify') return Promise.reject(new Error('Broken route'));
      return Promise.resolve();
    },
  };
  return {
    operations,
    events,
    changeVersion: (version: string) => {
      active = version;
    },
  };
}

test('dry-run inspects the target without journaling or activating it', async () => {
  const { operations, events } = fixture();
  expect((await rollbackWorker({ ...input, apply: false }, operations)).changed).toBe(false);
  expect(events).toEqual(['inspect']);
});

test('journals before activation, verifies after, and makes reruns idempotent', async () => {
  const { operations, events } = fixture();
  expect((await rollbackWorker(input, operations)).changed).toBe(true);
  expect(events).toEqual([
    'inspect',
    'prepared',
    'inspect',
    'activate',
    'activated',
    'verify',
    'verified',
  ]);
  events.length = 0;
  expect((await rollbackWorker(input, operations)).changed).toBe(false);
  expect(events).toEqual(['inspect', 'verify']);
});

test.each(['activate', 'verify'])('preserves uncertainty after %s fails', async (failure) => {
  const { operations, events } = fixture(failure);
  const result = await rollbackWorker(input, operations);
  expect(result.ok).toBe(false);
  expect(result.changed).toBeNull();
  expect(events.at(-1)).toBe('unconfirmed');
});

test('refuses an unexpected deployment before mutation', async () => {
  const { operations, events, changeVersion } = fixture();
  changeVersion('00000000-0000-4000-8000-000000000000');
  await expect(rollbackWorker(input, operations)).rejects.toThrow(/changed/);
  expect(events).toEqual(['inspect']);
});

test('checks again after preparing its journal', async () => {
  const { operations, events, changeVersion } = fixture();
  operations.journal = (phase) => {
    events.push(phase);
    if (phase === 'prepared') changeVersion('00000000-0000-4000-8000-000000000000');
    return Promise.resolve();
  };
  const result = await rollbackWorker(input, operations);
  expect(result.ok).toBe(false);
  expect(events).not.toContain('activate');
});

test('reports no change when the checkout guard rejects activation', async () => {
  const { operations, events } = fixture();
  operations.guard = () => {
    throw new Error('Dirty checkout');
  };
  const result = await rollbackWorker(input, operations);
  expect(result.changed).toBe(false);
  expect(events).not.toContain('activate');
  expect(events.at(-1)).toBe('failed');
});
