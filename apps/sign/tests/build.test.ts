import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { URL } from 'node:url';

const app = new URL('../', import.meta.url);
void test('the standalone sign builds with local brand assets and blocks indexing', async () => {
  const build = spawnSync(process.execPath, ['scripts/build.mjs'], { cwd: app, encoding: 'utf8' });
  assert.equal(build.status, 0, build.stderr);
  const html = await readFile(new URL('dist/index.html', app), 'utf8');
  for (const match of html.matchAll(/(?:href|src)="(\/[^"#]*)"/g)) {
    await readFile(new URL(`dist${match[1]}`, app));
  }
  assert.match(html, /name="robots" content="noindex,nofollow"/);
  assert.match(
    await readFile(new URL('dist/_headers', app), 'utf8'),
    /X-Robots-Tag: noindex, nofollow/,
  );
});
