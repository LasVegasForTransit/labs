import { expect, test } from 'vitest';
import { doctorInput } from '../src/doctor.js';

test('doctor accepts repository and project configuration audits', () => {
  expect(doctorInput(['--json', '--dry-run'])).toEqual({ slug: undefined, json: true });
  expect(doctorInput(['home'])).toEqual({ slug: 'home', json: false });
});

test('doctor rejects mutations, extra projects, and ambiguous selection', () => {
  expect(() => doctorInput(['--apply'])).toThrow();
  expect(() => doctorInput(['home', 'map'])).toThrow();
  expect(() => doctorInput(['home', '--slug', 'map'])).toThrow();
});
