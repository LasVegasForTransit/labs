import { expect, test } from 'vitest';
import { rollbackInput } from '../src/rollback-input.js';

test('rollback selects retained source and preserves the expected current version precondition', async () => {
  const args = [
    'home',
    '--run-id',
    '123',
    '--expected-version',
    '1c4deaba-ee53-4c3f-ba65-176ae596cad5',
    '--commit',
    'a'.repeat(40),
    '--reason',
    'Restore working catalog',
    '--json',
  ];
  expect(await rollbackInput(args)).toMatchObject({ slug: 'home', runId: '123', apply: false });
  await expect(rollbackInput([...args, '--apply', '--dry-run'])).rejects.toThrow(/together/);
  await expect(
    rollbackInput(['home', '--version', '1c4deaba-ee53-4c3f-ba65-176ae596cad5', '--json']),
  ).rejects.toThrow();
  await expect(rollbackInput(['home', '--run-id', '123', '--json'])).rejects.toThrow();
});
