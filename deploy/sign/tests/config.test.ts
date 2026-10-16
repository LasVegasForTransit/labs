import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { URL } from 'node:url';
import config from '../cloudflare.config.ts';

void test('sign has a dedicated production domain and an isolated staging Worker', async () => {
  const production = config({ mode: 'production', isPreview: false });
  const staging = config({ mode: 'preview', isPreview: true });
  assert.equal(production.worker.name, 'lvbt-labs-sign');
  assert.deepEqual(production.worker.domains, ['sign.lasvegasfortransit.org']);
  assert.equal(staging.worker.name, 'lvbt-labs-sign-staging');
  assert.deepEqual(staging.worker.domains, []);
  assert.equal(production.worker.assets.notFoundHandling, 'none');
  const profiles = JSON.parse(
    await readFile(new URL('../../../.lvbt/tooling.json', import.meta.url), 'utf8'),
  ) as {
    release: {
      apps: {
        sign: {
          productionWorker: string;
          previewWorker: string;
          productionUrl: string;
          previewOnly?: boolean;
        };
      };
    };
  };
  assert.equal(profiles.release.apps.sign.productionWorker, production.worker.name);
  assert.equal(profiles.release.apps.sign.previewWorker, staging.worker.name);
  assert.equal(profiles.release.apps.sign.productionUrl, `https://${production.worker.domains[0]}`);
  assert.equal(profiles.release.apps.sign.previewOnly, undefined);
});
