import { createHash } from 'node:crypto';
import { lstat, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

export function validateArchivePath(name: string): void {
  if (/[\\\r\n\0]/.test(name) || name.split('/').some((part) => ['', '.', '..'].includes(part)))
    throw new Error(`Invalid archive file path: ${JSON.stringify(name)}`);
}

export function archiveChecksums(files: ReadonlyMap<string, Buffer>): string {
  return [...files]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, contents]) => {
      validateArchivePath(name);
      return `${createHash('sha256').update(contents).digest('hex')}  ${name}\n`;
    })
    .join('');
}

export async function readArchiveFiles(directory: string): Promise<Map<string, Buffer>> {
  if (!(await lstat(directory)).isDirectory())
    throw new Error('An archive must be a regular directory.');
  const files = new Map<string, Buffer>();
  async function visit(relative: string): Promise<void> {
    for (const entry of await readdir(path.join(directory, relative), { withFileTypes: true })) {
      const name = relative ? `${relative}/${entry.name}` : entry.name;
      validateArchivePath(name);
      if (entry.isDirectory()) await visit(name);
      else if (entry.isFile()) files.set(name, await readFile(path.join(directory, name)));
      else throw new Error(`Archive asset must be a regular file or directory: ${name}`);
    }
  }
  await visit('');
  return new Map([...files].sort(([left], [right]) => left.localeCompare(right)));
}

export function readProjectArchiveFiles(environment: NodeJS.ProcessEnv = process.env) {
  const directory = environment.LVBT_ARCHIVE_DIRECTORY;
  if (directory !== undefined && (!path.isAbsolute(directory) || directory.trim() === ''))
    throw new Error('LVBT_ARCHIVE_DIRECTORY must name an absolute snapshot directory.');
  return readArchiveFiles(directory ?? 'dist-archive');
}
