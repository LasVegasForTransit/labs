import { execFile, execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { z } from 'zod';
import { verifyStoredArchive } from './archive-store.js';

export async function verifyArchiveReleaseSource(root: string, slug: string, commit?: string) {
  z.string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u)
    .parse(slug);
  if (!commit) return await verifyStoredArchive(path.join(root, 'retired', slug));
  z.string()
    .regex(/^[a-f0-9]{40}$/u)
    .parse(commit);
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'labs-retained-archive-'));
  try {
    const archive = await promisify(execFile)('git', ['archive', commit, '--', `retired/${slug}`], {
      cwd: root,
      encoding: 'buffer',
      maxBuffer: 32 * 1024 * 1024,
    });
    execFileSync('tar', ['-xf', '-', '-C', temporary], { input: archive.stdout, timeout: 20_000 });
    return await verifyStoredArchive(path.join(temporary, 'retired', slug));
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}
