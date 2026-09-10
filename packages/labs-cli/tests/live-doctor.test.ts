import { expect, test } from 'vitest';
import { liveDoctor } from '../src/live-doctor.js';

const securityHeaders = {
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
};

function response(body: string | null, init: ResponseInit = {}) {
  return new Response(body, { headers: securityHeaders, ...init });
}

function release(slug: string) {
  return Response.json({
    formatVersion: 1,
    slug,
    commit: 'a'.repeat(40),
    artifactHash: 'b'.repeat(64),
  });
}

function requestUrl(input: string | URL | Request) {
  return typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
}

function fetched(response: Response) {
  return Promise.resolve(response);
}

test('verifies live home and project routing through their release markers', async () => {
  const requested: string[] = [];
  const checks = await liveDoctor(
    'labs.example.org',
    [
      { slug: 'home', name: 'lvbt-labs-home' },
      { slug: 'map', name: 'lvbt-labs-map' },
    ],
    (input) => {
      const url = requestUrl(input);
      requested.push(url);
      if (url.endsWith('/map/lvbt-release.json')) return fetched(release('map'));
      if (url.endsWith('/lvbt-release.json')) return fetched(release('home'));
      if (url.endsWith('/map'))
        return fetched(response(null, { status: 308, headers: { location: '/map/' } }));
      if (url.endsWith('/not-a-lab'))
        return fetched(response('<h1>Not found</h1>', { status: 404 }));
      return fetched(response('<h1>Project</h1>'));
    },
  );

  expect(checks).toEqual([
    expect.objectContaining({ id: 'live.dns-tls', status: 'pass' }),
    expect.objectContaining({ id: 'live.headers', status: 'pass' }),
    expect.objectContaining({ id: 'live.release-markers', status: 'pass' }),
    expect.objectContaining({ id: 'live.routes', status: 'pass' }),
    expect.objectContaining({ id: 'live.multi-worker', status: 'pass' }),
  ]);
  expect(requested).toContain('https://labs.example.org/map');
  expect(requested).toContain('https://labs.example.org/map/lvbt-release.json');
  expect(requested).toContain('https://labs.example.org/not-a-lab');
});

test('reports missing release markers and a home-only deployment', async () => {
  const checks = await liveDoctor(
    'labs.example.org',
    [{ slug: 'home', name: 'lvbt-labs-home' }],
    (input) => {
      const url = requestUrl(input);
      if (url.endsWith('/lvbt-release.json'))
        return fetched(response('<h1>Not found</h1>', { status: 404 }));
      if (url.endsWith('/not-a-lab'))
        return fetched(response('<h1>Not found</h1>', { status: 404 }));
      return fetched(response('<h1>Labs</h1>'));
    },
  );

  expect(checks.find(({ id }) => id === 'live.release-markers')?.status).toBe('fail');
  expect(checks.find(({ id }) => id === 'live.multi-worker')?.status).toBe('fail');
});

test('rejects a project route that falls through to the home worker', async () => {
  const checks = await liveDoctor(
    'labs.example.org',
    [
      { slug: 'home', name: 'lvbt-labs-home' },
      { slug: 'map', name: 'lvbt-labs-map' },
    ],
    (input) => {
      const url = requestUrl(input);
      if (url.endsWith('/lvbt-release.json')) return fetched(release('home'));
      if (url.endsWith('/map/lvbt-release.json')) return fetched(release('home'));
      if (url.endsWith('/not-a-lab') || url.endsWith('/map'))
        return fetched(response('<h1>Not found</h1>', { status: 404 }));
      return fetched(response('<h1>Labs</h1>'));
    },
  );

  expect(checks.find(({ id }) => id === 'live.release-markers')?.status).toBe('fail');
  expect(checks.find(({ id }) => id === 'live.routes')?.status).toBe('fail');
});

test('rejects an exact project route that redirects away from Labs', async () => {
  const checks = await liveDoctor(
    'labs.example.org',
    [
      { slug: 'home', name: 'lvbt-labs-home' },
      { slug: 'map', name: 'lvbt-labs-map' },
    ],
    (input) => {
      const url = requestUrl(input);
      if (url.endsWith('/map/lvbt-release.json')) return fetched(release('map'));
      if (url.endsWith('/lvbt-release.json')) return fetched(release('home'));
      if (url.endsWith('/map'))
        return fetched(
          response(null, { status: 308, headers: { location: 'https://example.net/map/' } }),
        );
      if (url.endsWith('/not-a-lab'))
        return fetched(response('<h1>Not found</h1>', { status: 404 }));
      return fetched(response('<h1>Project</h1>'));
    },
  );

  expect(checks.find(({ id }) => id === 'live.routes')?.status).toBe('fail');
});
