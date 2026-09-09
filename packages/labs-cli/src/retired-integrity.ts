import { lstat, readdir } from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import type { LabManifestV1 } from './manifest.js';
import { verifyStoredArchive } from './archive-store.js';

export async function verifyRetiredArchives(root: string, records: readonly LabManifestV1[]) {
  const directory = path.join(root, 'retired');
  const archives = new Map<string, LabManifestV1>();
  let entries: Dirent[];
  try {
    if (!(await lstat(directory)).isDirectory())
      throw new Error('Retired archives need a regular directory.');
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    entries = [];
  }
  for (const entry of entries) {
    if (entry.isSymbolicLink())
      throw new Error(`Retired archives cannot contain a symbolic link: ${entry.name}`);
    if (!entry.isDirectory()) continue;
    const archive = await verifyStoredArchive(path.join(directory, entry.name));
    archives.set(entry.name, archive.manifest);
  }
  for (const record of records.filter((manifest) => manifest.status === 'retired')) {
    if (!isDeepStrictEqual(archives.get(record.slug), record))
      throw new Error(`Retired catalog record ${record.slug} does not match a verified archive.`);
  }
  return archives;
}
