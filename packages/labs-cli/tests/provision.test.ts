import { expect, test } from 'vitest';
import { provisionInput } from '../src/provision.js';

test('compatibility provision defaults to read-only standard planning', () => {
  expect(provisionInput([])).toEqual({ apply: false, json: false });
  expect(provisionInput(['--apply', '--json'])).toEqual({ apply: true, json: true });
  expect(() => provisionInput(['--apply', '--dry-run'])).toThrow();
  expect(() => provisionInput(['unexpected'])).toThrow();
});
