import { execFile } from 'node:child_process';
import { lstat, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { isDeepStrictEqual, promisify } from 'node:util';
import { z } from 'zod';
import {
  retirementIdentity,
  storeRetirementArchive,
  verifyStoredArchive,
} from './archive-store.js';
import { parseManifestSource } from './manifest-source.js';

type ArchiveScript = 'build:archive' | 'test:archive';
type RunArchiveScript = (
  script: ArchiveScript,
  options: { cwd: string; archiveDirectory?: string },
) => Promise<void>;

const runArchiveScript: RunArchiveScript = async (script, options) => {
  const env = { ...process.env };
  delete env.LVBT_ARCHIVE_DIRECTORY;
  if (options.archiveDirectory !== undefined) env.LVBT_ARCHIVE_DIRECTORY = options.archiveDirectory;
  await promisify(execFile)('pnpm', ['run', script], {
    cwd: options.cwd,
    env,
    timeout: 600000,
    maxBuffer: 16 * 1024 * 1024,
  });
};

export async function prepareRetirementArchive(
  root: string,
  identity: Parameters<typeof storeRetirementArchive>[1],
  run: RunArchiveScript = runArchiveScript,
) {
  const expected = retirementIdentity(identity);
  const { manifest } = expected;
  const cwd = path.join(root, 'apps', manifest.slug);
  if (!(await lstat(cwd)).isDirectory()) throw new Error('The app must be a regular directory.');
  z.object({
    scripts: z.object({
      'build:archive': z.string().trim().min(1),
      'test:archive': z.string().trim().min(1),
    }),
  }).parse(JSON.parse(await readFile(path.join(cwd, 'package.json'), 'utf8')));
  const directory = path.join(root, 'retired', manifest.slug);
  const existing = await lstat(directory).catch((error: unknown) => {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  });
  if (existing !== undefined) {
    const stored = await verifyStoredArchive(directory);
    if (
      !isDeepStrictEqual(stored.manifest, expected.manifest) ||
      !isDeepStrictEqual(stored.provenance, expected.provenance)
    )
      throw new Error('The stored archive belongs to a different retirement identity.');
    return storeRetirementArchive(root, identity, path.join(directory, 'site'), (staged) =>
      run('test:archive', { cwd, archiveDirectory: staged }),
    );
  }
  const file = path.join(cwd, 'lab.config.ts');
  const source = await readFile(file, 'utf8');
  const retiredSource = parseManifestSource(source, manifest.slug).update(manifest);
  if (retiredSource !== source) await writeFile(file, retiredSource);
  let sourceChanged = false;
  try {
    await run('build:archive', { cwd });
  } finally {
    if (retiredSource !== source) {
      sourceChanged = (await readFile(file, 'utf8')) !== retiredSource;
      if (!sourceChanged) await writeFile(file, source);
    }
  }
  if (sourceChanged)
    throw new Error('The manifest changed during the archive build; source was preserved.');
  return storeRetirementArchive(root, identity, path.join(cwd, 'dist-archive'), (staged) =>
    run('test:archive', { cwd, archiveDirectory: staged }),
  );
}
