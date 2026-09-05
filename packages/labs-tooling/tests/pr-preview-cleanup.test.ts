import { expect, test } from 'vitest';
import { cleanupPreviews } from '../src/pr-preview-cleanup.js';

test('deletes only owned temporary Workers for a closed PR and reruns without deletion', async () => {
  let present = true;
  let removed = 0;
  const ops = {
    closed: () => Promise.resolve(true),
    read: () =>
      Promise.resolve(
        present ? { repository: 'example/labs', pullRequest: 3, version: 'v1', routes: [] } : null,
      ),
    remove: () => {
      present = false;
      removed += 1;
      return Promise.resolve();
    },
  };
  const run = (apply: boolean) =>
    cleanupPreviews({ repository: 'example/labs', pullRequest: 3 }, ['map'], ops, apply);
  expect((await run(false)).changed).toBe(false);
  expect(removed).toBe(0);
  expect((await run(true)).ok).toBe(true);
  expect((await run(true)).changed).toBe(false);
  expect(removed).toBe(1);
});

test.each(['open', 'owner', 'route'])('refuses cleanup for %s', async (failure) => {
  let removed = false;
  const result = await cleanupPreviews(
    { repository: 'example/labs', pullRequest: 3 },
    ['map'],
    {
      closed: () => Promise.resolve(failure !== 'open'),
      read: () =>
        Promise.resolve({
          repository: failure === 'owner' ? 'other/repo' : 'example/labs',
          pullRequest: 3,
          version: 'v1',
          routes: failure === 'route' ? ['labs.example.org/map/*'] : [],
        }),
      remove: () => {
        removed = true;
        return Promise.resolve();
      },
    },
    true,
  );
  expect(result.ok).toBe(false);
  expect(removed).toBe(false);
});
