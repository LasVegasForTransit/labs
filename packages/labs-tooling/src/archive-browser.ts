import type { Browser } from '@playwright/test';
import path from 'node:path';
import { validateArchivePath } from './archive-files.js';

export { readArchiveFiles, archiveChecksums } from './archive-files.js';

export type ArchiveFailure =
  | { kind: 'request'; url: string; method: string }
  | { kind: 'websocket'; url: string }
  | { kind: 'connection'; api: string }
  | { kind: 'runtime' | 'console'; message: string };

const contentTypes: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.json': 'application/json',
  '.geojson': 'application/geo+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.xml': 'application/xml',
  '.pdf': 'application/pdf',
};

export function archiveRoutes(slug: string, files: ReadonlyMap<string, Buffer>) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug === 'home')
    throw new Error('An archive requires a non-home lab slug.');
  const rootIndex = files.has('index.html');
  if (rootIndex === files.has(`${slug}/index.html`))
    throw new Error('Expected one root or slug-prefixed archive index.');
  const routes = new Map<string, { body: Buffer; contentType: string }>();
  for (const [name, contents] of files) {
    validateArchivePath(name);
    if (!rootIndex && !name.startsWith(`${slug}/`))
      throw new Error(`Archive file lies outside its slug: ${name}`);
    const pathname = `/${name.startsWith(`${slug}/`) ? '' : `${slug}/`}${name.split('/').map(encodeURIComponent).join('/')}`;
    const asset = {
      body: Buffer.from(contents),
      contentType: contentTypes[path.extname(name)] ?? 'application/octet-stream',
    };
    if (routes.has(pathname)) throw new Error(`Ambiguous archive URL: ${pathname}`);
    routes.set(pathname, asset);
    if (pathname.endsWith('/index.html'))
      routes.set(pathname.slice(0, -'index.html'.length), asset);
  }
  return routes;
}

export async function createArchiveContext(
  browser: Browser,
  options: {
    slug: string;
    files: ReadonlyMap<string, Buffer>;
    viewport?: { width: number; height: number } | undefined;
  },
) {
  const routes = archiveRoutes(options.slug, options.files);
  const origin = 'https://archive.invalid';
  const failures: ArchiveFailure[] = [];
  const context = await browser.newContext({
    serviceWorkers: 'block',
    viewport: options.viewport ?? { width: 1280, height: 720 },
  });
  try {
    await context.exposeBinding('__lvbtArchiveConnectionAttempt', (_source, api: unknown) => {
      if (typeof api === 'string') failures.push({ kind: 'connection', api });
    });
    await context.addInitScript({
      content: `
      for (const api of ['RTCPeerConnection', 'webkitRTCPeerConnection', 'WebTransport']) {
        Object.defineProperty(globalThis, api, {
          configurable: false,
          writable: false,
          value: function () {
            void globalThis.__lvbtArchiveConnectionAttempt(api);
            throw new Error('Retirement archives cannot use ' + api + '.');
          },
        });
      }
    `,
    });
    await context.route('**/*', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const asset = routes.get(
        url.pathname === `/${options.slug}` ? `/${options.slug}/` : url.pathname,
      );
      if (url.origin !== origin || !['GET', 'HEAD'].includes(request.method()) || !asset) {
        failures.push({ kind: 'request', url: request.url(), method: request.method() });
        await route.abort('blockedbyclient');
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: asset.contentType,
        body: request.method() === 'HEAD' ? Buffer.alloc(0) : asset.body,
        headers: { 'x-content-type-options': 'nosniff' },
      });
    });
    await context.routeWebSocket('**/*', async (socket) => {
      failures.push({ kind: 'websocket', url: socket.url() });
      await socket.close({ code: 1008, reason: 'Retirement archives have no live connections.' });
    });
    context.on('page', (page) => {
      page.on('pageerror', (error) => failures.push({ kind: 'runtime', message: error.message }));
      page.on('console', (message) => {
        if (message.type() === 'error') failures.push({ kind: 'console', message: message.text() });
      });
    });
    return { context, origin, failures };
  } catch (error) {
    await context.close();
    throw error;
  }
}
