import { spawn, type ChildProcess } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import {
  createServer,
  request as createUpstreamRequest,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { validateManifestForDirectory, type LabManifestV1 } from './manifest.js';

const previewHost = '127.0.0.1';
const publicPort = 8797;
const firstWorkerPort = publicPort + 1;

export interface PreviewTarget {
  slug: string;
  port: number;
}

function ownsPath(slug: string, pathname: string): boolean {
  const prefix = `/${slug}`;
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function selectPreviewTarget(
  pathname: string,
  targets: readonly PreviewTarget[],
): PreviewTarget {
  const home = targets.find((target) => target.slug === 'home');
  if (home === undefined) throw new Error('The catalog preview requires apps/home.');

  return (
    targets
      .filter((target) => target.slug !== 'home')
      .sort((left, right) => right.slug.length - left.slug.length)
      .find((target) => ownsPath(target.slug, pathname)) ?? home
  );
}

async function loadManifest(root: string, slug: string): Promise<LabManifestV1> {
  const configPath = path.join(root, 'apps', slug, 'lab.config.ts');
  const module = (await import(pathToFileURL(configPath).href)) as { default?: unknown };
  return validateManifestForDirectory(module.default, slug);
}

async function discoverTargets(root: string): Promise<PreviewTarget[]> {
  const entries = await readdir(path.join(root, 'apps'), { withFileTypes: true });
  const manifests = await Promise.all(
    entries.filter((entry) => entry.isDirectory()).map((entry) => loadManifest(root, entry.name)),
  );
  manifests.sort((left, right) => {
    if (left.slug === 'home') return -1;
    if (right.slug === 'home') return 1;
    return left.slug.localeCompare(right.slug);
  });
  return manifests.map((manifest, index) => ({
    slug: manifest.slug,
    port: firstWorkerPort + index,
  }));
}

function run(command: string, arguments_: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, arguments_, { stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${arguments_.join(' ')} exited with code ${code ?? 1}.`));
    });
  });
}

function startWorker(target: PreviewTarget): ChildProcess {
  return spawn(
    'pnpm',
    [
      '--filter',
      `@lvbt/lab-${target.slug}`,
      'exec',
      'wrangler',
      'dev',
      '--port',
      String(target.port),
      '--inspector-port',
      String(9232 + target.port - firstWorkerPort),
    ],
    { stdio: 'inherit' },
  );
}

async function waitForWorker(target: PreviewTarget, child: ChildProcess): Promise<void> {
  const deadline = Date.now() + 60_000;
  const url = `http://${previewHost}:${target.port}/`;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`The ${target.slug} preview exited before becoming ready.`);
    }
    try {
      await fetch(url);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error(`The ${target.slug} preview did not become ready within 60 seconds.`);
}

function proxyRequest(
  request: IncomingMessage,
  response: ServerResponse,
  targets: readonly PreviewTarget[],
): void {
  const requestUrl = request.url ?? '/';
  const pathname = new URL(requestUrl, 'http://labs.local').pathname;
  const target = selectPreviewTarget(pathname, targets);
  const headers = { ...request.headers, host: `${previewHost}:${target.port}` };
  const upstream = createUpstreamRequest(
    {
      host: previewHost,
      port: target.port,
      method: request.method,
      path: requestUrl,
      headers,
    },
    (upstreamResponse) => {
      response.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers);
      upstreamResponse.pipe(response);
    },
  );
  upstream.on('error', (error) => {
    if (!response.headersSent) response.writeHead(502, { 'content-type': 'text/plain' });
    response.end(`Preview upstream unavailable: ${error.message}\n`);
  });
  request.pipe(upstream);
}

async function main(): Promise<void> {
  const root = process.cwd();
  const targets = await discoverTargets(root);
  await run('pnpm', ['build']);

  const workers = targets.map((target) => startWorker(target));
  const stopWorkers = (): void => {
    for (const worker of workers) {
      if (worker.exitCode === null) worker.kill('SIGTERM');
    }
  };

  try {
    await Promise.all(targets.map((target, index) => waitForWorker(target, workers[index]!)));
    const server = createServer((request, response) => proxyRequest(request, response, targets));
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(publicPort, previewHost, resolve);
    });
    process.stdout.write(`Labs preview ready at http://${previewHost}:${publicPort}\n`);

    const shutdown = (): void => {
      server.close();
      stopWorkers();
    };
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
  } catch (error) {
    stopWorkers();
    throw error;
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
