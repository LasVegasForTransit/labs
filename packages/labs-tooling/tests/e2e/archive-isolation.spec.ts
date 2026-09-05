import { expect, test } from '@playwright/test';
import { createSocket } from 'node:dgram';
import { createArchiveContext } from '../../src/archive-browser.js';

const files = new Map([
  ['index.html', Buffer.from('<h1>Archived map</h1><script src="/map/app.js"></script>')],
  ['map/app.js', Buffer.from('document.documentElement.dataset.loaded = "yes"')],
  ['data.json', Buffer.from('{"routes":3}')],
]);

test('reads only captured archive files without an upstream server', async ({ browser }) => {
  const archive = await createArchiveContext(browser, { slug: 'map', files });
  try {
    const page = await archive.context.newPage();
    await page.goto(`${archive.origin}/map`);
    await expect(page).toHaveURL(`${archive.origin}/map`);
    await expect(page.getByRole('heading')).toHaveText('Archived map');
    await expect(page.locator('html')).toHaveAttribute('data-loaded', 'yes');
    const data: unknown = await page.evaluate(async () => (await fetch('/map/data.json')).json());
    expect(data).toEqual({ routes: 3 });
    await page.reload();
    await expect(page.getByRole('heading')).toHaveText('Archived map');
    expect(archive.failures).toEqual([]);
  } finally {
    await archive.context.close();
  }
});

test('denies external, API, write, prefix-collision, and websocket requests', async ({
  browser,
}) => {
  const archive = await createArchiveContext(browser, { slug: 'map', files });
  try {
    const page = await archive.context.newPage();
    await page.goto(`${archive.origin}/map/`);
    const outcomes = await page.evaluate(async () => {
      const requests = [
        fetch('https://example.com/tracker.js'),
        fetch('/map/api/live'),
        fetch('/map/data.json', { method: 'POST', body: 'write' }),
        fetch('/mapper/'),
      ];
      return (await Promise.allSettled(requests)).map((result) => result.status);
    });
    expect(outcomes).toEqual(['rejected', 'rejected', 'rejected', 'rejected']);
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          const socket = new WebSocket('wss://example.com/live');
          socket.onclose = () => resolve();
        }),
    );
    expect(archive.failures.filter((failure) => failure.kind === 'request')).toHaveLength(4);
    expect(archive.failures).toContainEqual({ kind: 'websocket', url: 'wss://example.com/live' });
  } finally {
    await archive.context.close();
  }
});

test('prevents WebRTC packets and reports page-level transport attempts', async ({ browser }) => {
  const socket = createSocket('udp4');
  let packets = 0;
  socket.on('message', () => {
    packets += 1;
  });
  await new Promise<void>((resolve) => socket.bind(0, '127.0.0.1', resolve));
  const archive = await createArchiveContext(browser, { slug: 'map', files });
  try {
    const page = await archive.context.newPage();
    await page.goto(`${archive.origin}/map/`);
    const results = await page.evaluate((port) => {
      const errors: string[] = [];
      for (const api of ['RTCPeerConnection', 'WebTransport']) {
        try {
          const Constructor = Reflect.get(globalThis, api) as new (options: unknown) => unknown;
          new Constructor(
            api === 'WebTransport'
              ? 'https://example.com/'
              : {
                  iceServers: [{ urls: `stun:127.0.0.1:${port}` }],
                },
          );
        } catch (error) {
          errors.push(String(error));
        }
      }
      return errors;
    }, socket.address().port);
    expect(results).toHaveLength(2);
    await expect
      .poll(() => archive.failures.filter((failure) => failure.kind === 'connection').length)
      .toBe(2);
    expect(packets).toBe(0);
  } finally {
    await archive.context.close();
    socket.close();
  }
});

test('refuses ambiguous public asset paths', async ({ browser }) => {
  await expect(
    createArchiveContext(browser, {
      slug: 'map',
      files: new Map([...files, ['app.js', Buffer.from('different content at the same URL')]]),
    }),
  ).rejects.toThrow(/Ambiguous archive URL/);
});

test('blocks service worker registration', async ({ browser }) => {
  const archive = await createArchiveContext(browser, { slug: 'map', files });
  try {
    const page = await archive.context.newPage();
    await page.goto(`${archive.origin}/map/`);
    await page.evaluate('navigator.serviceWorker.register("/map/app.js").catch(() => null)');
    expect(archive.context.serviceWorkers()).toEqual([]);
    expect(await page.evaluate('navigator.serviceWorker.controller === null')).toBe(true);
  } finally {
    await archive.context.close();
  }
});

test('captures runtime errors instead of accepting a broken offline screen', async ({
  browser,
}) => {
  const archive = await createArchiveContext(browser, {
    slug: 'map',
    files: new Map([
      ['index.html', Buffer.from('<script>throw Error("No offline data")</script>')],
    ]),
  });
  try {
    const page = await archive.context.newPage();
    await page.goto(`${archive.origin}/map/`);
    expect(archive.failures).toContainEqual({ kind: 'runtime', message: 'No offline data' });
  } finally {
    await archive.context.close();
  }
});
