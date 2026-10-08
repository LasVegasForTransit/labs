import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchAssets } from '../worker.ts';

void test('home delegates the original request and streams the unchanged static asset response', async () => {
  const request = new Request('https://labs.example.org/brand/logo.svg?version=1');
  const response = new Response('asset bytes', {
    status: 200,
    headers: { 'content-type': 'image/svg+xml' },
  });
  const result = await fetchAssets(request, {
    ASSETS: {
      fetch: (input) => {
        assert.equal(input, request);
        return Promise.resolve(response);
      },
      connect: () => {
        throw new Error('No outbound connections.');
      },
    },
  });
  assert.equal(result, response);
  assert.equal(await result.text(), 'asset bytes');
});
