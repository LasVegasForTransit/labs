import { expect, test } from 'vitest';
import { parseDeploymentArguments } from '../src/deployment-cli.js';

test('requires an explicit comparison base or full deployment plan', () => {
  expect(parseDeploymentArguments(['--all', '--dry-run', '--json'])).toEqual({});
  expect(parseDeploymentArguments(['--base', 'abc', '--head', 'def'])).toEqual({
    base: 'abc',
    head: 'def',
  });
  expect(() => parseDeploymentArguments([])).toThrow(/--base/);
  expect(() => parseDeploymentArguments(['--all', '--base', 'abc'])).toThrow(/not both/);
  expect(() => parseDeploymentArguments(['--all', '--apply'])).toThrow();
});
