import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { URL, fileURLToPath } from 'node:url';
import test from 'node:test';
import ts from 'typescript';

import config from '../cloudflare.config.ts';

const cloudflare = config({ mode: 'production', isPreview: false });
import wranglerBuild from '../wrangler.config.ts';

const deployDir = path.dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const appDir = path.resolve(deployDir, '../../apps/transit-funding');
const mirrorPath = path.join(appDir, 'wrangler.jsonc');
const parsed = ts.parseConfigFileTextToJson(mirrorPath, await readFile(mirrorPath, 'utf8'));
assert.equal(parsed.error, undefined);
const homeMirrorPath = path.resolve(appDir, '../home/wrangler.jsonc');
const homeParsed = ts.parseConfigFileTextToJson(
  homeMirrorPath,
  await readFile(homeMirrorPath, 'utf8'),
);
assert.equal(homeParsed.error, undefined);
const mirror = parsed.config as {
  name: string;
  compatibility_date: string;
  compatibility_flags: string[];
  preview_urls: boolean;
  observability: { enabled: boolean; head_sampling_rate: number };
  assets: { directory: string; not_found_handling: string };
};
const build = wranglerBuild as { assetsDirectory: string };

void test('cf transit funding matches the draft Wrangler worker and asset contract', () => {
  assert.equal(cloudflare.accountId, (homeParsed.config as { account_id: string }).account_id);
  assert.equal(cloudflare.worker.name, mirror.name);
  assert.equal(cloudflare.worker.compatibilityDate, mirror.compatibility_date);
  assert.deepEqual(cloudflare.worker.compatibilityFlags, mirror.compatibility_flags);
  assert.equal(cloudflare.worker.previewUrls, mirror.preview_urls);
  assert.deepEqual(cloudflare.worker.observability, {
    enabled: mirror.observability.enabled,
    headSamplingRate: mirror.observability.head_sampling_rate,
  });
  assert.equal(cloudflare.worker.assets.notFoundHandling, mirror.assets.not_found_handling);
  assert.equal(
    path.resolve(deployDir, build.assetsDirectory),
    path.resolve(appDir, mirror.assets.directory),
  );
  assert.equal('triggers' in cloudflare.worker, false);
  assert.equal('domains' in cloudflare.worker, false);
});

void test('canonical preview uses an independent Worker without production routes', () => {
  const preview = config({ mode: 'preview', isPreview: true });
  assert.equal(preview.worker.name, 'lvbt-labs-transit-funding-staging');
  assert.equal(preview.worker.env.ASSETS.type, 'assets');
  assert.equal(preview.worker.assets.runWorkerFirst, true);
  assert.deepEqual('domains' in preview.worker ? preview.worker.domains : [], []);
  assert.deepEqual('triggers' in preview.worker ? preview.worker.triggers : [], []);
});
