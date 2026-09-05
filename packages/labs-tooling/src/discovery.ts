import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { readCatalogRecords } from './catalog-records.js';
import { validateManifestForDirectory, type LabManifestV1 } from './manifest.js';

export async function discoverLabs(root: string): Promise<LabManifestV1[]> {
  const appsDirectory = path.join(root, 'apps');
  const entries = await readdir(appsDirectory, { withFileTypes: true });
  const appDirectories = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
  const manifests = await Promise.all(
    appDirectories.map(async (directoryName) => {
      const configPath = path.join(appsDirectory, directoryName, 'lab.config.ts');
      const module = (await import(/* @vite-ignore */ pathToFileURL(configPath).href)) as {
        default?: unknown;
      };
      return validateManifestForDirectory(module.default, directoryName);
    }),
  );
  const records = [...manifests, ...(await readCatalogRecords(root))];
  const slugs = new Set<string>();
  for (const record of records) {
    if (slugs.has(record.slug)) throw new Error(`Duplicate ownership of lab slug ${record.slug}.`);
    slugs.add(record.slug);
  }
  return records.sort((a, b) => a.slug.localeCompare(b.slug));
}
