import {
  link,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  rmdir,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

async function removeCreatedFiles(written: Map<string, Buffer>, directories: Set<string>) {
  const failures: unknown[] = [];
  for (const [file, content] of written) {
    try {
      if ((await readFile(file)).equals(content)) await unlink(file);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') failures.push(error);
    }
  }
  for (const parent of [...directories].sort((a, b) => b.length - a.length)) {
    try {
      await rmdir(parent);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') failures.push(error);
    }
  }
  if (failures.length > 0) throw new AggregateError(failures, 'Project cleanup is incomplete.');
}

async function publishProject(directory: string, staged: string, names: string[]) {
  await mkdir(directory);
  const written = new Map<string, Buffer>();
  const directories = new Set([directory]);
  try {
    for (const name of names) {
      const source = path.join(staged, name);
      if (!(await lstat(source)).isFile())
        throw new Error(`Expected a regular generated file: ${name}`);
      const content = await readFile(source);
      const file = path.join(directory, name);
      let parent = path.dirname(file);
      while (parent !== directory) {
        directories.add(parent);
        parent = path.dirname(parent);
      }
      await mkdir(path.dirname(file), { recursive: true });
      await link(source, file);
      written.set(file, content);
    }
  } catch (error) {
    try {
      await removeCreatedFiles(written, directories);
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        `Creation failed; inspect ${directory} before retrying. Existing or changed files were preserved.`,
        { cause: cleanupError },
      );
    }
    throw error;
  }
}

export async function writeProject(
  directory: string,
  files: Record<string, string>,
  format: (directory: string) => void | Promise<void> = (target) => {
    execFileSync('pnpm', ['exec', 'prettier', '--write', target], {
      cwd: path.join(directory, '../..'),
      stdio: 'pipe',
    });
  },
): Promise<void> {
  const names = Object.keys(files);
  if (
    names.some(
      (name) =>
        path.isAbsolute(name) || name.split(/[\\/]/).some((part) => part === '..' || part === ''),
    )
  )
    throw new Error('Generated files must use relative paths inside the project.');
  const staged = await mkdtemp(path.join(directory, '../../.lvbt-create-'));
  try {
    for (const [name, content] of Object.entries(files)) {
      await mkdir(path.dirname(path.join(staged, name)), { recursive: true });
      await writeFile(path.join(staged, name), content, { flag: 'wx' });
    }
    await format(staged);
    await publishProject(directory, staged, names);
  } finally {
    await rm(staged, { recursive: true, force: true });
  }
}
