import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { expect, test } from 'vitest';
import {
  readArchiveFiles,
  readProjectArchiveFiles,
  archiveChecksums,
} from '../src/archive-files.js';

test('captures binary assets and stable checksums independently of directory order', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'lvbt-archive-files-'));
  try {
    await mkdir(path.join(root, 'assets'));
    await writeFile(path.join(root, 'index.html'), '<h1>Archived</h1>');
    await writeFile(path.join(root, 'assets/data.bin'), Buffer.from([0, 255, 1]));
    const files = await readArchiveFiles(root);
    expect([...files.keys()]).toEqual(['assets/data.bin', 'index.html']);
    expect(files.get('assets/data.bin')).toEqual(Buffer.from([0, 255, 1]));
    expect(archiveChecksums(files)).toBe(archiveChecksums(new Map([...files].reverse())));
    expect(archiveChecksums(files).split('\n').filter(Boolean)).toHaveLength(2);
    const original = archiveChecksums(files);
    files.set('index.html', Buffer.from('changed'));
    expect(archiveChecksums(files)).not.toBe(original);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('refuses symbolic-link roots and nested assets', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'lvbt-archive-links-'));
  try {
    await mkdir(path.join(root, 'site'));
    await writeFile(path.join(root, 'outside'), 'not part of the archive');
    await symlink(path.join(root, 'site'), path.join(root, 'alias'));
    await expect(readArchiveFiles(path.join(root, 'alias'))).rejects.toThrow(/regular directory/);
    await symlink(path.join(root, 'outside'), path.join(root, 'site/leak'));
    await expect(readArchiveFiles(path.join(root, 'site'))).rejects.toThrow(/regular file/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test.each(['../escape', '/absolute', 'a\\b', 'a\nb', 'a/../b'])(
  'rejects ambiguous checksum path %j',
  (name) => {
    expect(() => archiveChecksums(new Map([[name, Buffer.from('data')]]))).toThrow(/path/);
  },
);

test('project suites read the selected snapshot instead of their build directory', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'lvbt-archive-snapshot-'));
  try {
    await writeFile(path.join(root, 'index.html'), 'captured content');
    const files = await readProjectArchiveFiles({ LVBT_ARCHIVE_DIRECTORY: root });
    expect(files.get('index.html')?.toString()).toBe('captured content');
    expect(() => readProjectArchiveFiles({ LVBT_ARCHIVE_DIRECTORY: '' })).toThrow(/absolute/);
    expect(() => readProjectArchiveFiles({ LVBT_ARCHIVE_DIRECTORY: '../build' })).toThrow(
      /absolute/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
