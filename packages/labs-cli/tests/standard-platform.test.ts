import { expect, test } from 'vitest';
import * as platform from '../src/standard-platform.js';

test('default provision is read-only and cannot create a repository or deploy a Worker', async () => {
  const calls: string[][] = [];
  const run = (_root: string, args: string[]) => {
    calls.push(args);
    return Promise.resolve({ status: 0, stdout: 'ready', stderr: '' });
  };
  const result = await platform.runStandardPlatform('/repo', false, { run, interactive: false });
  expect(result.ok).toBe(true);
  expect(result.changed).toBe(false);
  expect(calls).toEqual([['preflight', '--production']]);
});

test('explicit setup uses the shared interactive bootstrap and rejects unattended mutations', async () => {
  const calls: string[][] = [];
  const run = (_root: string, args: string[]) => {
    calls.push(args);
    return Promise.resolve({ status: 0, stdout: '', stderr: '' });
  };
  await expect(
    platform.runStandardPlatform('/repo', true, { run, interactive: false }),
  ).rejects.toThrow(/terminal/);
  expect(calls).toEqual([]);
  const result = await platform.runStandardPlatform('/repo', true, { run, interactive: true });
  expect(result.changed).toBeNull();
  expect(calls).toEqual([['bootstrap', '--production']]);
});

test('missing, failed and unreadable readiness reports never count as ready', async () => {
  for (const status of [1, 2]) {
    expect(
      (
        await platform.runStandardPlatform('/repo', false, {
          run: () => Promise.resolve({ status, stdout: '', stderr: 'preview Worker missing' }),
          interactive: false,
        })
      ).ok,
    ).toBe(false);
  }
  await expect(
    platform.runStandardPlatform('/repo', false, {
      run: () => Promise.reject(new Error('unavailable')),
      interactive: false,
    }),
  ).rejects.toThrow(/unavailable/);
});
