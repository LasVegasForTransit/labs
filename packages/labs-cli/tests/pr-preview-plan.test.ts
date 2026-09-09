import { expect, test } from 'vitest';
import { previewTargets } from '../src/pr-preview-plan.js';

test('uses versions for deployed apps and temporary Workers for new apps', () => {
  const result = previewTargets(23, ['map', 'home'], ['lvbt-labs-home']);
  expect(result).toEqual([
    { slug: 'map', worker: 'lvbt-labs-pr-23-map', mode: 'temporary', cleanup: true },
    { slug: 'home', worker: 'lvbt-labs-home', mode: 'version', cleanup: false },
  ]);
});

test('stateful apps use dedicated staging rather than production version uploads', () => {
  expect(previewTargets(23, ['map'], ['lvbt-labs-map'], ['map'])).toEqual([
    { slug: 'map', worker: 'lvbt-labs-staging-map', mode: 'staging', cleanup: false },
  ]);
});

test.each([0, -1, 1.5, Number.NaN])('rejects invalid pull request number %s', (number) => {
  expect(() => previewTargets(number, ['home'], [])).toThrow();
});

test('rejects invalid, duplicate, and oversized identities without truncating names', () => {
  expect(() => previewTargets(1, ['../home'], [])).toThrow();
  expect(() => previewTargets(1, ['map', 'map'], [])).toThrow();
  expect(() => previewTargets(1, ['a'.repeat(64)], [])).toThrow();
  expect(() => previewTargets(1, ['map', 'pr-1-map'], [])).toThrow(/collides/);
});
