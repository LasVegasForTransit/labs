import { lstat, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { validateManifestForDirectory, type LabManifestV1 } from './manifest.js';

export async function readCatalogRecords(root: string): Promise<LabManifestV1[]> {
  const directory = path.join(root, 'catalog');
  let stat;
  try {
    stat = await lstat(directory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
  if (!stat.isDirectory() || stat.isSymbolicLink())
    throw new Error('The catalog must be a regular directory.');
  const records: LabManifestV1[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!entry.name.endsWith('.json')) continue;
    if (!entry.isFile()) throw new Error(`Catalog record ${entry.name} must be a regular file.`);
    const slug = entry.name.slice(0, -'.json'.length);
    const manifest = validateManifestForDirectory(
      JSON.parse(await readFile(path.join(directory, entry.name), 'utf8')),
      slug,
    );
    if (slug === 'home' || !['retired', 'graduated'].includes(manifest.status))
      throw new Error(`Catalog record ${slug} must describe a retired or graduated lab, not home.`);
    records.push(manifest);
  }
  return records.sort((a, b) => a.slug.localeCompare(b.slug));
}
