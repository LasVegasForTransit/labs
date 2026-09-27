import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { expect, test } from '@playwright/test';
import { verifyPreviewBrowser } from '../../src/pr-preview-browser.js';

async function withPage(html: string, run: (origin: string, visits: string[]) => Promise<void>) {
  const visits: string[] = [];
  const server = createServer((request, response) => {
    visits.push(request.url ?? '/');
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(html);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address() as AddressInfo;
    await run(`http://127.0.0.1:${address.port}/`, visits);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

const page =
  '<!doctype html><html lang="en"><head><title>Preview</title></head><body><main><h1>Preview</h1><a href="/next">Next</a></main></body></html>';

test('checks a deployed project preview at desktop and mobile widths', async () => {
  await withPage(page, async (origin, visits) => {
    await verifyPreviewBrowser({ slug: 'example' }, { url: origin });
    expect(visits.filter((visit) => visit === '/example/')).toHaveLength(4);
  });
});

test('rejects a preview whose project link cannot receive keyboard focus', async () => {
  await withPage(page.replace('href="/next"', 'href="/next" tabindex="-1"'), async (origin) => {
    await expect(verifyPreviewBrowser({ slug: 'home' }, { url: origin })).rejects.toThrow(
      /keyboard/i,
    );
  });
});

test('rejects browser errors from a deployed preview', async () => {
  await withPage(
    page.replace('</body>', '<script>console.error("preview failed")</script></body>'),
    async (origin) => {
      await expect(verifyPreviewBrowser({ slug: 'home' }, { url: origin })).rejects.toThrow(
        /preview failed/,
      );
    },
  );
});

test('rejects an analytics beacon in a deployed preview', async () => {
  await withPage(
    page.replace(
      '</body>',
      '<script src="https://static.cloudflareinsights.com/beacon.min.js"></script></body>',
    ),
    async (origin) => {
      await expect(verifyPreviewBrowser({ slug: 'home' }, { url: origin })).rejects.toThrow(
        /analytics/i,
      );
    },
  );
});
