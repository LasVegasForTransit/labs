import { expect, test } from 'vitest';
import { loadState, useProvisionFixture } from '../test-support/provision-idempotent-fixture.js';
import { provision } from '../src/provision.js';

// End-to-end coverage for `pnpm lab provision --apply`: it must reconcile
// managed GitHub and Cloudflare resources idempotently. This drives the real
// provision() entry point against a fake `gh`, a fake `pnpm`/`wrangler`, and a
// stubbed Cloudflare Workers API (plus a stubbed "live site"), so the test
// exercises the actual read-compare-write logic instead of re-asserting unit
// behavior already covered elsewhere. See
// ../test-support/provision-idempotent-fixture.ts for the fixture itself.

const fixture = useProvisionFixture();

test('a first apply provisions every managed resource and reports ok', async () => {
  const first = await provision(fixture.root, ['--apply']);

  expect(first.mode).toBe('apply');
  expect(first.blockedBy).toEqual([]);
  expect(
    first.operations.every((operation) => ['matched', 'verified'].includes(operation.status)),
  ).toBe(true);
  expect(first.changed).toBe(true);
  expect(first.remaining).toEqual([]);
  expect(first.ok).toBe(true);

  const state = await loadState(fixture.stateFile);
  expect(state.repo).not.toBeNull();
  expect(state.rulesets).toHaveLength(1);
  expect(state.cloudflare.workers.map((worker) => worker.id).sort()).toEqual([
    'lvbt-labs-demo',
    'lvbt-labs-home',
  ]);
  expect(state.cloudflare.domains).toHaveLength(1);
  expect(state._log.length).toBeGreaterThan(0);
}, 30000);

test('a second apply against unchanged infrastructure makes no writes and still reports ok', async () => {
  await provision(fixture.root, ['--apply']);
  const afterFirst = await loadState(fixture.stateFile);
  const writesAfterFirst = afterFirst._log.length;
  expect(writesAfterFirst).toBeGreaterThan(0);

  const second = await provision(fixture.root, ['--apply']);

  expect(second.ok).toBe(true);
  expect(second.changed).toBe(false);
  expect(second.remaining).toEqual([]);
  expect(second.operations.every((operation) => operation.status === 'matched')).toBe(true);

  const afterSecond = await loadState(fixture.stateFile);
  const newEntries = afterSecond._log.slice(writesAfterFirst);
  expect(newEntries).toEqual([]);

  // Explicitly confirm the write classes the spec calls out never recur.
  expect(newEntries.some((entry) => /^(POST|PUT|PATCH|DELETE) /.test(entry))).toBe(false);
  expect(newEntries.some((entry) => entry.startsWith('secret-set'))).toBe(false);
  expect(newEntries.some((entry) => entry.startsWith('wrangler-upload'))).toBe(false);
}, 30000);

test('resumes provisioning after one group fails, completing only what remains', async () => {
  fixture.control.failDomainOnce = true;

  const first = await provision(fixture.root, ['--apply']);
  expect(first.ok).toBe(false);
  // A write that could not be confirmed makes the overall result ambiguous
  // rather than falsely "unchanged".
  expect(first.changed).toBeNull();

  const afterFailure = await loadState(fixture.stateFile);
  // Everything before the routing group already landed...
  expect(afterFailure.repo).not.toBeNull();
  expect(afterFailure.rulesets).toHaveLength(1);
  expect(afterFailure.cloudflare.workers.map((worker) => worker.id).sort()).toEqual([
    'lvbt-labs-demo',
    'lvbt-labs-home',
  ]);
  // ...but the failed group, and everything queued after it, did not.
  expect(afterFailure.cloudflare.domains).toEqual([]);
  expect(afterFailure.cloudflare.routes).toEqual([]);
  expect(afterFailure.cloudflare.analyticsSites).toEqual([]);
  const logAfterFailure = afterFailure._log.length;

  const second = await provision(fixture.root, ['--apply']);
  expect(second.ok).toBe(true);
  expect(second.changed).toBe(true);
  expect(second.remaining).toEqual([]);

  const afterResume = await loadState(fixture.stateFile);
  const resumeEntries = afterResume._log.slice(logAfterFailure);

  // The resume run finishes the routing group and everything queued after it.
  expect(resumeEntries.some((entry) => entry.includes('workers/domains'))).toBe(true);
  expect(resumeEntries.some((entry) => entry.includes('workers/routes'))).toBe(true);
  expect(resumeEntries.some((entry) => entry.includes('rum/site_info'))).toBe(true);

  // It does not redo work the first attempt already finished successfully.
  expect(resumeEntries.some((entry) => entry.startsWith('POST orgs/'))).toBe(false);
  expect(resumeEntries.some((entry) => entry.includes('/rulesets'))).toBe(false);
  expect(resumeEntries.some((entry) => entry.startsWith('wrangler-upload'))).toBe(false);
}, 30000);
