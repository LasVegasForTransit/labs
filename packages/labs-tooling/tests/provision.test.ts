import { expect, test } from 'vitest';
import { provisionInput, runProvision } from '../src/provision.js';

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
  const checks = [
    'github.repository',
    'github.rules',
    'cloudflare.zone',
    'cloudflare.domain',
    'cloudflare.workers',
  ].map((id) => ({ id, status: 'pass' as const }));
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
