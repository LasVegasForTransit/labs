import { expect, test } from 'vitest';
import { formatPreviewComment } from '../src/pr-preview-comment.js';

test('lists verified preview URLs and identifies temporary Workers', () => {
  expect(
    formatPreviewComment({
      command: 'preview',
      ok: true,
      results: [
        {
          target: { slug: 'home', worker: 'lvbt-labs-home', mode: 'version', cleanup: false },
          status: 'verified',
          receipt: { version: 'v1', url: 'https://v1-home.example.workers.dev' },
        },
        {
          target: {
            slug: 'map',
            worker: 'lvbt-labs-pr-17-map',
            mode: 'temporary',
            cleanup: true,
          },
          status: 'verified',
          receipt: { version: 'v2', url: 'https://map.example.workers.dev' },
        },
      ],
    }),
  ).toBe(
    [
      '## Preview deployments',
      '',
      '- [Labs home](https://v1-home.example.workers.dev/) at `v1`',
      '- [map](https://map.example.workers.dev/map/) at `v2` (temporary Worker)',
    ].join('\n'),
  );
});

test('reports a withheld or failed preview without inventing a URL', () => {
  expect(
    formatPreviewComment({
      command: 'preview',
      ok: false,
      phase: 'verify',
      results: [
        {
          target: { slug: 'map', worker: 'worker', mode: 'temporary', cleanup: true },
          status: 'failed',
          phase: 'verify',
        },
      ],
    }),
  ).toContain('- `map`: failed during `verify`');
});

test('reports command setup failures before any target exists', () => {
  expect(
    formatPreviewComment({
      command: 'preview',
      ok: false,
      errors: ['Cloudflare credentials unavailable.'],
    }),
  ).toBe(
    [
      '## Preview deployments',
      '',
      '- Preview setup failed: Cloudflare credentials unavailable.',
    ].join('\n'),
  );
});
