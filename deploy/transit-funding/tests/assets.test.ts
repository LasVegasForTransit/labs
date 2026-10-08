import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchAssets } from '../worker.ts';

void test('funding serves compiled assets beneath its permanent path on staging and production', async () => {
  for (const origin of [
    'https://labs.example.org',
    'https://funding-staging.example.workers.dev',
  ]) {
    for (const [route, asset] of [
      ['/transit-funding/', '/'],
      ['/transit-funding/assets/app.js?version=1', '/assets/app.js?version=1'],
      ['/transit-funding/explore', '/explore'],
      ['/transit-funding-other/', '/transit-funding-other/'],
    ]) {
      const request = new Request(`${origin}${route}`);
      const response = new Response('compiled bytes', { status: 200 });
      const result = await fetchAssets(request, {
        ASSETS: {
          fetch: (input) => {
            assert.ok(input instanceof Request);
            assert.equal(input.url, `${origin}${asset}`);
            return Promise.resolve(response);
          },
          connect: () => {
            throw new Error('No outbound connections.');
          },
        },
      });
      assert.equal(result, response);
      assert.equal(request.url, `${origin}${route}`);
    }
  }
});
