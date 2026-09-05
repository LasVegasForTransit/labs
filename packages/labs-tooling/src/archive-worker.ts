import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { archiveRoutes } from './archive-browser.js';
import { verifyStoredArchive } from './archive-store.js';
import type { ArchiveAsset } from './archive-worker-runtime.js';
import { writeProject } from './create-write.js';
import { archiveChecksums } from './archive-files.js';
import type { ReleaseMarker } from './release-artifact.js';

export async function prepareArchiveWorker(archive: string, destination: string, commit?: string) {
  if (commit !== undefined && !/^[a-f0-9]{40}$/.test(commit))
    throw new Error('An archive deployment requires a full source commit hash.');
  const { manifest, site } = await verifyStoredArchive(archive);
  const routes = archiveRoutes(manifest.slug, site);
  let marker: ReleaseMarker | undefined;
  if (commit !== undefined) {
    marker = {
      formatVersion: 1,
      slug: manifest.slug,
      commit,
      artifactHash: createHash('sha256').update(archiveChecksums(site)).digest('hex'),
    };
    routes.set(`/${manifest.slug}/lvbt-release.json`, {
      body: Buffer.from(JSON.stringify(marker)),
      contentType: 'application/json',
    });
  }
  const inventory: Record<string, ArchiveAsset> = {};
  const files: Record<string, string | Buffer> = {};
  for (const [url, content] of routes) {
    const hash = createHash('sha256').update(content.body).digest('hex');
    files[`assets/${hash}`] = content.body;
    inventory[url] = { asset: `/${hash}`, contentType: content.contentType };
  }
  files['routes.json'] = JSON.stringify(inventory);
  files['runtime.ts'] = await readFile(new URL('./archive-worker-runtime.ts', import.meta.url));
  files['worker.ts'] = `import { archiveFetch } from './runtime';
import routes from './routes.json';
export default {
  fetch(request: Request, env: { ASSETS: { fetch(request: Request): Promise<Response> } }) {
    return archiveFetch(request, env.ASSETS, routes);
  },
};
`;
  files['wrangler.jsonc'] = JSON.stringify(
    {
      name: `lvbt-labs-${manifest.slug}`,
      main: './worker.ts',
      compatibility_date: '2026-08-31',
      workers_dev: false,
      preview_urls: false,
      keep_vars: false,
      observability: { enabled: true, head_sampling_rate: 1 },
      routes: [
        {
          pattern: `labs.lasvegasfortransit.org/${manifest.slug}`,
          zone_name: 'lasvegasfortransit.org',
        },
        {
          pattern: `labs.lasvegasfortransit.org/${manifest.slug}/*`,
          zone_name: 'lasvegasfortransit.org',
        },
      ],
      assets: {
        directory: './assets',
        binding: 'ASSETS',
        run_worker_first: true,
        html_handling: 'none',
        not_found_handling: 'none',
      },
    },
    null,
    2,
  );
  await writeProject(destination, files, () => {});
  return {
    manifest,
    marker,
    directory: destination,
    config: path.join(destination, 'wrangler.jsonc'),
  };
}
