import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { archiveRoutes } from './archive-browser.js';
import { verifyStoredArchive } from './archive-store.js';
import type { ArchiveAsset } from './archive-worker-runtime.js';
import { writeProject } from './create-write.js';

export async function prepareArchiveWorker(archive: string, destination: string) {
  const { manifest, site } = await verifyStoredArchive(archive);
  const routes = archiveRoutes(manifest.slug, site);
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
  return { manifest, directory: destination, config: path.join(destination, 'wrangler.jsonc') };
}
