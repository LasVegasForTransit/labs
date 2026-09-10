import { expect, test } from 'vitest';
import { provisionInput, runProvision, runProvisionGroups } from '../src/provision.js';

test('provision defaults to planning and rejects contradictory flags', () => {
  expect(provisionInput([])).toEqual({ apply: false, json: false });
  expect(provisionInput(['--apply', '--json'])).toEqual({ apply: true, json: true });
  expect(() => provisionInput(['--apply', '--dry-run'])).toThrow();
  expect(() => provisionInput(['unexpected'])).toThrow();
});

test('unverified account identity prevents writes', async () => {
  let writes = 0;
  const result = await runProvision(
    true,
    [
      {
        id: 'variable',
        read: () => Promise.resolve(null),
        desired: () => 'value',
        write: () => {
          writes += 1;
          return Promise.resolve();
        },
      },
    ],
    () => Promise.resolve([{ id: 'cloudflare.zone', status: 'unknown' as const }]),
  );
  expect(result.ok).toBe(false);
  expect(result.changed).toBe(false);
  expect(writes).toBe(0);
});

test('reports remaining infrastructure failures after verified managed writes', async () => {
  let state: string | null = null;
  const checks = ['github.repository', 'github.rules', 'cloudflare.zone', 'cloudflare.workers'].map(
    (id) => ({ id, status: 'pass' as const }),
  );
  const result = await runProvision(
    true,
    [
      {
        id: 'variable',
        read: () => Promise.resolve(state),
        desired: () => 'value',
        write: () => {
          state = 'value';
          return Promise.resolve();
        },
      },
    ],
    () => Promise.resolve([...checks, { id: 'github.credentials', status: 'fail' as const }]),
  );
  expect(result.changed).toBe(true);
  expect(result.ok).toBe(false);
  expect(result.operations[0]?.status).toBe('verified');
  expect(result.remaining).toEqual([{ id: 'github.credentials', status: 'fail' }]);
});

test('creates resources while a missing Worker identity remains under management', async () => {
  let workerExists = false;
  let writes = 0;
  const identityChecks = ['github.repository', 'github.rules', 'cloudflare.zone'].map((id) => ({
    id,
    status: 'pass' as const,
  }));
  const result = await runProvision(
    true,
    [
      {
        id: 'cloudflare.worker.lvbt-labs-home',
        read: () => Promise.resolve(workerExists),
        desired: () => true,
        write: () => {
          writes += 1;
          workerExists = true;
          return Promise.resolve();
        },
      },
    ],
    () =>
      Promise.resolve([
        ...identityChecks,
        {
          id: 'cloudflare.workers',
          status: workerExists ? ('pass' as const) : ('fail' as const),
        },
      ]),
  );

  expect(result.blockedBy).toEqual([]);
  expect(result.ok).toBe(true);
  expect(result.changed).toBe(true);
  expect(writes).toBe(1);
});

test('creates a repository before reading its dependent configuration', async () => {
  let repository = false;
  let rules = false;
  const result = await runProvisionGroups(
    true,
    [
      [
        {
          id: 'github.repository',
          read: () => Promise.resolve(repository),
          desired: () => true,
          write: () => {
            repository = true;
            return Promise.resolve();
          },
        },
      ],
      [
        {
          id: 'github.rules',
          read: () =>
            repository ? Promise.resolve(rules) : Promise.reject(new Error('repository missing')),
          desired: () => true,
          write: () => {
            rules = true;
            return Promise.resolve();
          },
        },
      ],
    ],
    () =>
      Promise.resolve([
        { id: 'cloudflare.zone', status: 'pass' as const },
        { id: 'github.repository', status: repository ? ('pass' as const) : ('fail' as const) },
        { id: 'github.rules', status: rules ? ('pass' as const) : ('unknown' as const) },
      ]),
  );

  expect(result.ok).toBe(true);
  expect(result.changed).toBe(true);
  expect(result.operations.map(({ status }) => status)).toEqual(['verified', 'verified']);
});
