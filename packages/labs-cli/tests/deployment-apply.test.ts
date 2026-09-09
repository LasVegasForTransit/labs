import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, test, vi } from 'vitest';
import { assertDeploymentCheckout, parseApplyArguments } from '../src/deployment-apply.js';

test('defaults to planning and requires an unambiguous apply request', () => {
  expect(parseApplyArguments(['--all'])).toEqual({ apply: false, refs: {} });
  expect(parseApplyArguments(['--base', 'abc', '--apply', '--json'])).toEqual({
    apply: true,
    refs: { base: 'abc' },
  });
  expect(() => parseApplyArguments(['--all', '--apply', '--dry-run'])).toThrow(/together/);
  expect(() => parseApplyArguments(['--all', '--apply', '--apply'])).toThrow(/once/);
});

test('rejects a clean checkout when remote main advances, and fails closed without a remote', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'lab-deployment-checkout-'));
  const origin = path.join(root, 'origin.git');
  const checkout = path.join(root, 'checkout');
  const git = (cwd: string, args: string[]) =>
    execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  function commit(parent?: string) {
    execFileSync('git', ['fast-import', '--quiet'], {
      cwd: origin,
      input: `commit refs/heads/main\ncommitter Test <test@example.org> 1788566400 +0000\ndata 4\ntest\n${parent === undefined ? '' : `from ${parent}\n`}\n`,
    });
    return git(origin, ['rev-parse', 'main']);
  }
  vi.stubEnv('GITHUB_REF', 'refs/heads/main');
  try {
    git(root, ['init', '--bare', '--initial-branch=main', origin]);
    const first = commit();
    git(root, ['clone', '--quiet', origin, checkout]);
    expect(() => assertDeploymentCheckout(checkout, first)).not.toThrow();
    await writeFile(path.join(checkout, 'uncommitted.txt'), 'local edit');
    expect(() => assertDeploymentCheckout(checkout, first)).toThrow(/local changes/);
    await rm(path.join(checkout, 'uncommitted.txt'));
    commit(first);
    expect(() => assertDeploymentCheckout(checkout, first)).toThrow(/remote main/);
    git(checkout, ['remote', 'remove', 'origin']);
    expect(() => assertDeploymentCheckout(checkout, first)).toThrow();
  } finally {
    vi.unstubAllEnvs();
    await rm(root, { recursive: true, force: true });
  }
});
