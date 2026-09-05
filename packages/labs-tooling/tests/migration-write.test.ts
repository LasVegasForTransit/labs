import { lstat, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from 'vitest';
import { writeMigration } from '../src/migration-write.js';
import type { MigrationFile } from '../src/migration-tree.js';

test('writes a standalone tree without replacing existing files', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'lvbt-migration-write-'));
  const destination = path.join(root, 'standalone');
  const binary = Buffer.from([0, 255, 128, 10]);
  const files = new Map<string, MigrationFile>([
    ['assets/example.bin', { content: binary, mode: '100644' }],
    ['.githooks/pre-commit', { content: Buffer.from('#!/bin/sh\n'), mode: '100755' }],
  ]);
  files.set('package.json', {
    content: Buffer.from('{"name":"example"}'),
    mode: '100644',
    generated: true,
  });
  try {
    await writeMigration(destination, files);
    expect(await readFile(path.join(destination, 'assets/example.bin'))).toEqual(binary);
    expect(await readFile(path.join(destination, 'package.json'), 'utf8')).toBe(
      '{\n  "name": "example"\n}\n',
    );
    expect((await lstat(path.join(destination, '.githooks/pre-commit'))).mode & 0o777).toBe(0o755);
    await expect(writeMigration(destination, files)).rejects.toThrow();
    expect(await readFile(path.join(destination, 'assets/example.bin'))).toEqual(binary);
    expect(await readdir(root)).toEqual(['standalone']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('rejects unsafe paths and non-regular Git modes before writing', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'lvbt-migration-write-'));
  try {
    for (const [name, mode] of [
      ['../escape', '100644'],
      ['link', '120000'],
    ]) {
      await expect(
        writeMigration(
          path.join(root, 'standalone'),
          new Map([[name ?? '', { content: Buffer.from('target'), mode: mode ?? '' }]]),
        ),
      ).rejects.toThrow();
      expect(await readdir(root)).toEqual([]);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
