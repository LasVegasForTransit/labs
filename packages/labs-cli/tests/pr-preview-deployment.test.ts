import { expect, test } from 'vitest';
import {
  assertPreviewHead,
  publishPullRequestPreviews,
  verifyPreviewReceipt,
} from '../src/pr-preview-deployment.js';

const commit = 'a'.repeat(40);
const identity = {
  repository: 'LasVegasForTransit/labs',
  pullRequest: 17,
  commit,
};

function requestUrl(input: Parameters<typeof fetch>[0]) {
  if (input instanceof URL) return input.href;
  if (typeof input === 'string') return input;
  return input.url;
}

test('accepts only an open same-repository pull request at the checked-out commit', async () => {
  await expect(
    assertPreviewHead('/repo', identity, {
      checkout: () => commit,
      pullRequest: () =>
        Promise.resolve({
          state: 'open',
          head: { sha: commit, repo: { full_name: 'LasVegasForTransit/labs' } },
        }),
    }),
  ).resolves.toBeUndefined();
});

test.each([
  ['closed', { state: 'closed', head: { sha: commit, repo: { full_name: identity.repository } } }],
  ['fork', { state: 'open', head: { sha: commit, repo: { full_name: 'contributor/labs' } } }],
  [
    'superseded',
    { state: 'open', head: { sha: 'b'.repeat(40), repo: { full_name: identity.repository } } },
  ],
])('rejects a %s pull request before credentialed work', async (_name, pullRequest) => {
  await expect(
    assertPreviewHead('/repo', identity, {
      checkout: () => commit,
      pullRequest: () => Promise.resolve(pullRequest),
    }),
  ).rejects.toThrow();
});

test('verifies the prefixed release marker, page, robots policy, and noindex header', async () => {
  const marker = {
    formatVersion: 1 as const,
    slug: 'map',
    commit,
    artifactHash: 'c'.repeat(64),
  };
  const requests: string[] = [];
  await verifyPreviewReceipt(
    { slug: 'map', worker: 'lvbt-labs-map', mode: 'version', cleanup: false },
    { version: 'version', url: 'https://version-map.example.workers.dev/' },
    marker,
    (input) => {
      const url = requestUrl(input);
      requests.push(url);
      if (url.endsWith('/map/lvbt-release.json'))
        return Promise.resolve(Response.json(marker, { headers: { 'x-robots-tag': 'noindex' } }));
      if (url.endsWith('/robots.txt'))
        return Promise.resolve(
          new Response('User-agent: *\nDisallow: /\n', {
            headers: { 'x-robots-tag': 'noindex' },
          }),
        );
      return Promise.resolve(
        new Response('<!doctype html>', { headers: { 'x-robots-tag': 'noindex, nofollow' } }),
      );
    },
  );
  expect(requests).toEqual([
    'https://version-map.example.workers.dev/map/lvbt-release.json',
    'https://version-map.example.workers.dev/map/',
    'https://version-map.example.workers.dev/robots.txt',
  ]);
});

test('rejects a preview page without the noindex response header', async () => {
  const marker = {
    formatVersion: 1 as const,
    slug: 'home',
    commit,
    artifactHash: 'c'.repeat(64),
  };
  await expect(
    verifyPreviewReceipt(
      { slug: 'home', worker: 'lvbt-labs-home', mode: 'version', cleanup: false },
      { version: 'version', url: 'https://version-home.example.workers.dev/' },
      marker,
      (input) =>
        Promise.resolve(
          requestUrl(input).endsWith('lvbt-release.json')
            ? Response.json(marker)
            : new Response('<!doctype html>'),
        ),
    ),
  ).rejects.toThrow(/noindex/i);
});

test('builds every affected package before uploading and verifying previews', async () => {
  const events: string[] = [];
  const target = {
    slug: 'home',
    worker: 'lvbt-labs-home',
    mode: 'version' as const,
    cleanup: false,
  };
  const marker = {
    formatVersion: 1 as const,
    slug: 'home',
    commit,
    artifactHash: 'c'.repeat(64),
  };
  const result = await publishPullRequestPreviews({
    root: '/repo',
    identity: { ...identity, accountId: 'abc123' },
    plan: { head: commit, packages: ['@lvbt/lab-home'], deploy: ['home'] },
    targets: [target],
    read: { get: () => Promise.resolve({}), list: () => Promise.resolve([]) },
    dependencies: {
      run: (args) => {
        events.push(`run:${args.join(' ')}`);
        return Promise.resolve('');
      },
      assertCurrent: () => {
        events.push('assert');
        return Promise.resolve();
      },
      prepare: () => {
        events.push('prepare');
        return Promise.resolve({ directory: '/bundle', marker });
      },
      upload: () => {
        events.push('upload');
        return Promise.resolve({ version: 'version', url: 'https://preview.example/' });
      },
      verify: () => {
        events.push('verify');
        return Promise.resolve();
      },
      record: () => {
        events.push('record');
        return Promise.resolve();
      },
    },
  });
  expect(result.ok).toBe(true);
  expect(events).toEqual([
    'run:check',
    'run:exec turbo run build --filter=@lvbt/lab-home',
    'assert',
    'prepare',
    'assert',
    'record',
    'upload',
    'record',
    'verify',
    'assert',
    'record',
  ]);
});
