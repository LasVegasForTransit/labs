import { link, mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import type * as FileSystem from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, test, vi } from 'vitest';
import { writeProject } from '../src/create-write.js';

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof FileSystem>();
  return { ...actual, link: vi.fn(actual.link) };
});

test('continues rollback when a published file has already been removed', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'lvbt-create-write-'));
  const directory = path.join(root, 'example');
  const actual = await vi.importActual<typeof FileSystem>('node:fs/promises');
  try {
    vi.mocked(link)
      .mockImplementationOnce(actual.link)
      .mockImplementationOnce(actual.link)
      .mockImplementationOnce(async () => {
        await rm(path.join(directory, 'a.ts'));
        throw new Error('Publication failed');
      });
    await expect(
      writeProject(directory, { 'a.ts': 'a', 'b.ts': 'b', 'c.ts': 'c' }, () => {}),
    ).rejects.toThrow('Publication failed');
    expect(await readdir(root)).toEqual([]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('cleans empty directories after publication fails before the first file', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'lvbt-create-write-'));
  try {
    vi.mocked(link).mockRejectedValueOnce(new Error('Filesystem failure'));
    await expect(
      writeProject(path.join(root, 'example'), { 'src/main.ts': 'source' }, () => {}),
    ).rejects.toThrow('Filesystem failure');
    expect(await readdir(root)).toEqual([]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('preserves a conflicting file introduced during publication and reports manual recovery', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'lvbt-create-write-'));
  const file = path.join(root, 'example/src/main.ts');
  try {
    vi.mocked(link).mockImplementationOnce(async () => {
      await writeFile(file, 'Concurrent work');
      throw new Error('Destination exists');
    });
    await expect(
      writeProject(path.join(root, 'example'), { 'src/main.ts': 'source' }, () => {}),
    ).rejects.toThrow(/inspect/);
    expect(await readFile(file, 'utf8')).toBe('Concurrent work');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('removes files published by a failed attempt without reserving the slug', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'lvbt-create-write-'));
  try {
    await expect(
      writeProject(
        path.join(root, 'example'),
        { 'src/main.ts': 'source', 'README.md': 'readme' },
        async (staged) => {
          await rm(path.join(staged, 'README.md'));
        },
      ),
    ).rejects.toThrow();
    expect(await readdir(root)).toEqual([]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('a failed formatter leaves the slug available and a retry creates the complete project', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'lvbt-create-write-'));
  const directory = path.join(root, 'example');
  const files = { 'src/main.ts': 'export const value=1;', 'README.md': '# Example\n' };
  try {
    await expect(
      writeProject(directory, files, () => {
        throw new Error('Formatting failed');
      }),
    ).rejects.toThrow('Formatting failed');
    expect(await readdir(root)).toEqual([]);
    await writeProject(directory, files, () => {});
    expect(await readFile(path.join(directory, 'src/main.ts'), 'utf8')).toBe(files['src/main.ts']);
    expect(await readdir(root)).toEqual(['example']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('never replaces an existing directory, including one created during formatting', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'lvbt-create-write-'));
  const directory = path.join(root, 'example');
  try {
    await expect(
      writeProject(directory, { 'README.md': 'Generated' }, async () => {
        await mkdir(directory);
        await writeFile(path.join(directory, 'README.md'), 'Someone else owns this');
      }),
    ).rejects.toThrow();
    expect(await readFile(path.join(directory, 'README.md'), 'utf8')).toBe(
      'Someone else owns this',
    );
    expect(await readdir(root)).toEqual(['example']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
