import { lstat, mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import type { MigrationFile } from './migration-tree.js';
import { writeMigration } from './migration-write.js';

export async function initializeMigrationRepository(directory: string) {
  const existing = await lstat(path.join(directory, '.git')).catch((error: unknown) => {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  });
  if (existing === undefined) {
    execFileSync('git', ['init', '--quiet', '--initial-branch=main', directory], {
      stdio: 'pipe',
      timeout: 30000,
    });
    return true;
  }
  if (!existing.isDirectory()) throw new Error('The standalone Git directory must not be a link.');
  const root = execFileSync('git', ['rev-parse', '--show-toplevel'], {
    cwd: directory,
    encoding: 'utf8',
    stdio: 'pipe',
    timeout: 30000,
  }).trim();
  if ((await realpath(root)) !== (await realpath(directory)))
    throw new Error('The export belongs to a different Git repository.');
  return false;
}

async function compareFile(directory: string, name: string, expected: Buffer, mode: string) {
  let current = directory;
  const parts = name.split('/');
  for (const part of parts.slice(0, -1)) {
    current = path.join(current, part);
    if (!(await lstat(current)).isDirectory())
      throw new Error(`The export differs at ${name}; existing files were preserved.`);
  }
  const file = path.join(directory, name);
  const stat = await lstat(file);
  if (
    !stat.isFile() ||
    (stat.mode & 0o777) !== (mode === '100755' ? 0o755 : 0o644) ||
    !(await readFile(file)).equals(expected)
  )
    throw new Error(`The export differs at ${name}; existing files were preserved.`);
}

export async function exportMigration(directory: string, files: Map<string, MigrationFile>) {
  const existing = await lstat(directory).catch((error: unknown) => {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  });
  if (existing === undefined) {
    await writeMigration(directory, files);
    return true;
  }
  if (!existing.isDirectory()) throw new Error('The export destination must be a directory.');
  const temporary = await mkdtemp(path.join(path.dirname(directory), '.lvbt-migration-'));
  try {
    const expected = path.join(temporary, 'expected');
    await writeMigration(expected, files);
    for (const [name, file] of files)
      await compareFile(directory, name, await readFile(path.join(expected, name)), file.mode);
    return false;
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}
