import { expect, test, vi } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { readCreateInput } from '../src/create-input.js';

const fields = {
  slug: 'street-plan',
  title: 'Street Plan',
  summary: 'Compare street layouts.',
  profile: 'app',
  kind: 'tool',
  maintainers: 'williecubed, example',
  'preview-image': '/street-plan/preview.png',
  'preview-alt': 'A street cross section',
  'content-license': 'CC-BY-4.0',
  'data-license': 'CC0-1.0',
  'asset-license': 'CC-BY-4.0',
};
const flags = Object.entries(fields).flatMap(([name, value]) => [`--${name}`, value]);

test('validates explicit dates and enforces the same code license for manifest files', async () => {
  const input = await readCreateInput([...flags, '--created', '2026-08-01']);
  expect(input.manifest.dates.created).toBe('2026-08-01');
  await expect(readCreateInput([...flags, '--created', '2026-02-30'])).rejects.toThrow();
  const directory = await mkdtemp(path.join(os.tmpdir(), 'lvbt-create-input-'));
  const file = path.join(directory, 'manifest.json');
  try {
    await writeFile(file, JSON.stringify(input.manifest));
    expect((await readCreateInput(['--manifest', file])).manifest).toEqual(input.manifest);
    await writeFile(
      file,
      JSON.stringify({
        ...input.manifest,
        licenses: { ...input.manifest.licenses, code: 'GPL-3.0' },
      }),
    );
    await expect(readCreateInput(['--manifest', file])).rejects.toThrow(/MIT/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('complete flags produce a draft manifest without prompting or applying by default', async () => {
  const question = vi.fn();
  const input = await readCreateInput(flags, { question, today: '2026-09-05' });
  expect(input.apply).toBe(false);
  expect(input.manifest).toMatchObject({
    slug: 'street-plan',
    profile: 'app',
    status: 'draft',
    visibility: 'unlisted',
    maintainers: ['williecubed', 'example'],
    dates: { created: '2026-09-05' },
    licenses: { code: 'MIT', content: 'CC-BY-4.0', data: 'CC0-1.0', assets: 'CC-BY-4.0' },
  });
  expect(question).not.toHaveBeenCalled();
  expect((await readCreateInput([...flags, '--apply'])).apply).toBe(true);
});

test('guided creation collects missing fields and preserves provided answers', async () => {
  const answers = Object.values(fields).slice(1);
  const question = vi.fn(() => Promise.resolve(answers.shift() ?? ''));
  const input = await readCreateInput(['--slug', fields.slug], { interactive: true, question });
  expect(input.manifest.title).toBe(fields.title);
  expect(question).toHaveBeenCalledTimes(Object.keys(fields).length - 1);
});

test('JSON and unattended invocation never prompt; conflicting inputs fail before prompting', async () => {
  const question = vi.fn();
  await expect(readCreateInput(['--json'], { interactive: true, question })).rejects.toThrow(
    /--slug/,
  );
  await expect(readCreateInput([], { interactive: false, question })).rejects.toThrow(/--slug/);
  await expect(readCreateInput([...flags, '--apply', '--dry-run'], { question })).rejects.toThrow(
    /together/,
  );
  await expect(
    readCreateInput(['--manifest', 'input.json', '--title', 'Conflict'], { question }),
  ).rejects.toThrow(/manifest/);
  expect(question).not.toHaveBeenCalled();
});
