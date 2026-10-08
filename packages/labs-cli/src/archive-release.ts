import { mkdtemp, mkdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import type { ReleaseConfiguration } from '@lasvegasfortransit/web-platform/release';
import { prepareArchiveWorker } from './archive-worker.js';
import { verifyStoredArchive } from './archive-store.js';

export function assertArchiveProfile(slug: string, config: ReleaseConfiguration): void {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(slug) || slug === 'home')
    throw new Error('Archive release requires a permanent non-home slug.');
  const required: Record<string, unknown> = {
    profile: slug,
    appDirectory: `.wrangler/archive-releases/${slug}`,
    productionWorker: `lvbt-labs-${slug}`,
    previewWorker: `lvbt-labs-${slug}-staging`,
    productionUrl: 'https://labs.lasvegasfortransit.org',
    publicPath: `/${slug}/`,
    typedConfig: 'cloudflare.config.mjs',
    assetsDirectory: 'assets',
    artifactSource: 'typed-worker',
  };
  if (
    Object.entries(required).some(
      ([key, value]) => config[key as keyof ReleaseConfiguration] !== value,
    )
  )
    throw new Error('Archive release profile identity must match its permanent Labs slug.');
  if (
    !isDeepStrictEqual(config.previewBindings, { ASSETS: { type: 'assets' } }) ||
    config.migrations?.length ||
    config.previewReadOnlyBindings?.length
  )
    throw new Error(
      'Archive release must declare ASSETS only, without secrets or writable storage.',
    );
}

/** Product archive generation only; packaging and publication use the standard typed release engine. */
export async function prepareArchiveRelease(
  root: string,
  slug: string,
  config: ReleaseConfiguration,
) {
  assertArchiveProfile(slug, config);
  const archive = path.join(root, 'retired', slug);
  await verifyStoredArchive(archive);
  const parent = path.join(root, '.wrangler/archive-releases');
  await mkdir(parent, { recursive: true });
  const temporary = await mkdtemp(path.join(parent, '.prepare-'));
  const staged = path.join(temporary, 'release');
  try {
    await prepareArchiveWorker(archive, staged);
    const worker = {
      name: config.productionWorker,
      entrypoint: 'worker.ts',
      compatibilityDate: '2026-08-31',
      observability: { enabled: true, headSamplingRate: 1 },
      assets: { runWorkerFirst: true, htmlHandling: 'none', notFoundHandling: 'none' },
      unsafe: { metadata: { keep_bindings: [] } },
      env: { ASSETS: { type: 'assets' as const } },
      domains: [] as string[],
      triggers: [
        {
          type: 'fetch' as const,
          pattern: `labs.lasvegasfortransit.org/${slug}`,
          zone: 'lasvegasfortransit.org',
        },
        {
          type: 'fetch' as const,
          pattern: `labs.lasvegasfortransit.org/${slug}/*`,
          zone: 'lasvegasfortransit.org',
        },
      ],
      workersDev: false,
      previewUrls: true,
    };
    const production = { worker };
    const preview = {
      worker: { ...worker, name: config.previewWorker, workersDev: true, triggers: [] },
    };
    await writeFile(
      path.join(staged, 'cloudflare.config.mjs'),
      `export default ({mode}) => mode === 'preview' ? ${JSON.stringify(preview)} : ${JSON.stringify(production)};\n`,
    );
    // The generated Wrangler mirror is not a configuration source or another deployment path.
    await rm(path.join(staged, 'wrangler.jsonc'));
    const directory = path.join(root, config.appDirectory);
    await rm(directory, { recursive: true, force: true });
    await rename(staged, directory);
    return { directory, production, preview };
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}
