import { expect, test } from 'vitest';
import { deploymentBaseline } from '../src/deployment-baseline.js';

const success = {
  id: 10,
  status: 'completed',
  conclusion: 'success',
  head_sha: 'a'.repeat(40),
};

test('uses the immediately preceding successful deployment, excluding the current run', () => {
  expect(
    deploymentBaseline(
      { workflow_runs: [{ ...success, id: 12, status: 'in_progress', conclusion: null }, success] },
      { id: 12, attempt: 1 },
    ),
  ).toBe(success.head_sha);
});

test.each(['failure', 'cancelled', 'timed_out', null])(
  'requires a full deployment after an uncertain run (%s), even with an older success',
  (conclusion) => {
    expect(
      deploymentBaseline(
        { workflow_runs: [success, { ...success, id: 11, conclusion }] },
        { id: 12, attempt: 1 },
      ),
    ).toBeNull();
  },
);

test('retries, missing history, and newer runs cannot supply an affected-only baseline', () => {
  expect(deploymentBaseline({ workflow_runs: [success] }, { id: 12, attempt: 2 })).toBeNull();
  expect(deploymentBaseline({ workflow_runs: [] }, { id: 12, attempt: 1 })).toBeNull();
  expect(deploymentBaseline({ workflow_runs: [success] }, { id: 9, attempt: 1 })).toBeNull();
  expect(() => deploymentBaseline({}, { id: 12, attempt: 1 })).toThrow();
});
