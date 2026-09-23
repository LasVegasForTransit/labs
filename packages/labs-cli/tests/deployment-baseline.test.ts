import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
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

test('the production workflow invokes the current Labs CLI path', async () => {
  const workflow = await readFile(
    path.resolve(import.meta.dirname, '../../../.github/workflows/deploy.yml'),
    'utf8',
  );
  expect(workflow).toContain('packages/labs-cli/src/deployment-baseline.ts "$RUNS"');
  expect(workflow).not.toContain('packages/labs-tooling');
});

test('the command reads the saved run history from the file it is given', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'lvbt-baseline-'));
  try {
    const history = path.join(directory, 'runs.json');
    await writeFile(history, JSON.stringify({ workflow_runs: [success] }));
    const script = path.resolve(import.meta.dirname, '../src/deployment-baseline.ts');
    const run = (args: string[]) =>
      execFileSync(process.execPath, ['--import', 'tsx', script, ...args], {
        encoding: 'utf8',
        env: { ...process.env, GITHUB_RUN_ID: '12', GITHUB_RUN_ATTEMPT: '1' },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    expect(run([history]).trim()).toBe(success.head_sha);
    expect(() => run([])).toThrow();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
