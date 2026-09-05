import { expect, test } from 'vitest';
import { publishPreviews } from '../src/pr-preview.js';
import { previewTargets } from '../src/pr-preview-plan.js';

test('builds everything before uploading and keeps receipts for failed verification', async () => {
  const events: string[] = [];
  const targets = previewTargets(2, ['map', 'home'], ['lvbt-labs-home']);
  const result = await publishPreviews(targets, {
    build: () => {
      events.push('build');
      return Promise.resolve();
    },
    assertCurrent: () => {
      events.push('current');
      return Promise.resolve();
    },
    record: (entry) => {
      events.push(entry.phase);
      return Promise.resolve();
    },
    upload: (target) => {
      events.push(`upload:${target.slug}`);
      return Promise.resolve({ version: 'version-id', url: 'https://example.workers.dev/' });
    },
    verify: (target) => {
      events.push(`verify:${target.slug}`);
      return target.slug === 'map'
        ? Promise.reject(new Error('private provider detail'))
        : Promise.resolve();
    },
  });
  expect(events[0]).toBe('build');
  expect(events.indexOf('uploading')).toBeLessThan(events.indexOf('upload:map'));
  expect(result.ok).toBe(false);
  expect(result.results[0]?.receipt?.version).toBe('version-id');
  expect(result.results[1]?.status).toBe('verified');
  expect(JSON.stringify(result)).not.toContain('private provider detail');
});

test('failed builds do not upload anything', async () => {
  let uploads = 0;
  const result = await publishPreviews(previewTargets(2, ['home'], []), {
    build: () => Promise.reject(new Error('failed')),
    assertCurrent: () => Promise.resolve(),
    record: () => Promise.resolve(),
    upload: () => {
      uploads += 1;
      return Promise.resolve({ version: 'id', url: 'https://example.workers.dev/' });
    },
    verify: () => Promise.resolve(),
  });
  expect(result.ok).toBe(false);
  expect(uploads).toBe(0);
});

test('superseded PR head stops uploads before any provider mutation', async () => {
  const events: string[] = [];
  const result = await publishPreviews(previewTargets(2, ['map', 'home'], []), {
    build: () => Promise.resolve(),
    assertCurrent: () => Promise.reject(new Error('head changed')),
    record: (entry) => {
      events.push(entry.phase);
      return Promise.resolve();
    },
    upload: () => {
      events.push('upload');
      return Promise.resolve({ version: 'id', url: 'https://example.workers.dev/' });
    },
    verify: () => Promise.resolve(),
  });
  expect(result.ok).toBe(false);
  expect(events).not.toContain('upload');
});
