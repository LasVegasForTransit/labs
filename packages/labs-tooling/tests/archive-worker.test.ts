import { expect, test } from 'vitest';
import { archiveFetch } from '../src/archive-worker-runtime.js';

const routes = { '/map/': { asset: '/abc', contentType: 'text/html; charset=utf-8' } };

test('redirects captured directories without a slash and preserves the query', async () => {
  const assets = {
    fetch: () => {
      throw new Error('Unexpected asset access');
    },
  };
  const result = await archiveFetch(new Request('https://labs.test/map/sources?q=1'), assets, {
    '/map/sources/': { asset: '/def', contentType: 'text/html' },
  });
  expect(result.status).toBe(308);
  expect(result.headers.get('location')).toBe('https://labs.test/map/sources/?q=1');
});

test('serves only inventoried URLs through the assets binding', async () => {
  const requests: Request[] = [];
  const assets = {
    fetch(request: Request) {
      requests.push(request);
      return Promise.resolve(new Response('<h1>Map</h1>'));
    },
  };
  const result = await archiveFetch(new Request('https://labs.test/map/?query=x'), assets, routes);
  expect(await result.text()).toBe('<h1>Map</h1>');
  expect(result.headers.get('content-type')).toBe('text/html; charset=utf-8');
  expect(result.headers.get('x-content-type-options')).toBe('nosniff');
  expect(requests[0]?.url).toBe('https://labs.test/abc');
  expect(requests[0]?.headers.has('cookie')).toBe(false);
});

test.each(['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'])(
  'rejects %s without reading assets',
  async (method) => {
    const assets = {
      fetch: () => {
        throw new Error('Unexpected asset access');
      },
    };
    const result = await archiveFetch(
      new Request('https://labs.test/map/', { method }),
      assets,
      routes,
    );
    expect(result.status).toBe(405);
    expect(result.headers.get('allow')).toBe('GET, HEAD');
  },
);

test.each(['/mapper/', '/map/api/live', '/abc', '/toString', '/__proto__'])(
  'returns 404 for uncaptured path %s',
  async (pathname) => {
    const assets = {
      fetch: () => {
        throw new Error('Unexpected asset access');
      },
    };
    expect(
      (await archiveFetch(new Request(`https://labs.test${pathname}`), assets, routes)).status,
    ).toBe(404);
  },
);

test('HEAD has no body and websocket upgrades are rejected', async () => {
  const assets = { fetch: () => Promise.resolve(new Response('content')) };
  const head = await archiveFetch(
    new Request('https://labs.test/map/', { method: 'HEAD' }),
    assets,
    routes,
  );
  expect(head.status).toBe(200);
  expect(await head.text()).toBe('');
  const upgrade = await archiveFetch(
    new Request('https://labs.test/map/', { headers: { upgrade: 'websocket' } }),
    assets,
    routes,
  );
  expect(upgrade.status).toBe(400);
});
