import { execFileSync } from 'node:child_process';
import { test, expect } from '@playwright/test';

test('installs transport guards when the archive helper runs through tsx', () => {
  const source = new URL('../../src/archive-browser.ts', import.meta.url).href;
  const output = execFileSync(
    process.execPath,
    [
      '--import',
      import.meta.resolve('tsx'),
      '--input-type=module',
      '-e',
      `
      import { chromium } from '@playwright/test';
      import { createArchiveContext } from ${JSON.stringify(source)};
      const browser = await chromium.launch();
      try {
        const archive = await createArchiveContext(browser, {
          slug: 'map', files: new Map([['index.html', Buffer.from('<h1>Archive</h1>')]])
        });
        const page = await archive.context.newPage();
        await page.goto(archive.origin + '/map/');
        const error = await page.evaluate(() => {
          try { new RTCPeerConnection(); return null; }
          catch (error) { return error.message; }
        });
        console.log(JSON.stringify({ error, runtimeErrors: archive.failures.filter(f => f.kind === 'runtime') }));
      } finally { await browser.close(); }
    `,
    ],
    { encoding: 'utf8', timeout: 15_000 },
  );
  const result: unknown = JSON.parse(output);
  expect(result).toEqual({
    error: 'Retirement archives cannot use RTCPeerConnection.',
    runtimeErrors: [],
  });
});
