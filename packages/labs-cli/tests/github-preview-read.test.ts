import { expect, test } from 'vitest';
import { githubPreviewReader } from '../src/github-preview-read.js';

test('models a missing preview environment without hiding unrelated provider failures', async () => {
  const preview = 'repos/example/labs/environments/preview';
  const calls: string[] = [];
  const read = githubPreviewReader(
    preview,
    (endpoint) => {
      calls.push(`required:${endpoint}`);
      return Promise.resolve({ required: true });
    },
    (endpoint) => {
      calls.push(`optional:${endpoint}`);
      return Promise.resolve(null);
    },
  );

  await expect(read('repos/example/labs')).resolves.toEqual({ required: true });
  await expect(read(preview)).resolves.toBeNull();
  await expect(read(`${preview}/secrets`)).resolves.toEqual({ secrets: [] });
  expect(calls).toEqual([
    'required:repos/example/labs',
    `optional:${preview}`,
    `optional:${preview}/secrets`,
  ]);
});
