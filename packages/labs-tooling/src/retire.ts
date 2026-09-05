import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { lstat, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { isDeepStrictEqual, parseArgs } from 'node:util';
import { verifyStoredArchive } from './archive-store.js';
import { LabManifestV1Schema, type LabManifestV1 } from './manifest.js';
import { parseManifestSource } from './manifest-source.js';
import { prepareRetirementArchive } from './retirement-archive.js';

async function retirementInput(args: string[]) {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      slug: { type: 'string' },
      reason: { type: 'string' },
      apply: { type: 'boolean' },
      'dry-run': { type: 'boolean' },
      json: { type: 'boolean' },
    },
  });
  if (values.apply && values['dry-run'])
    throw new Error('--apply and --dry-run cannot be used together.');
  if (positionals.length > 1 || (positionals.length > 0 && values.slug !== undefined))
    throw new Error('Provide one lab slug.');
  let slug = values.slug ?? positionals[0];
  let reason = values.reason;
  if (process.stdin.isTTY && !values.json) {
    const prompt = createInterface({ input: process.stdin, output: process.stderr });
    try {
      slug ??= await prompt.question('Lab slug: ');
      reason ??= await prompt.question('Reason for retirement: ');
    } finally {
      prompt.close();
    }
  }
  if (slug === undefined || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))
    throw new Error('Provide a lowercase kebab-case slug.');
  if (!reason?.trim()) throw new Error('--reason is required.');
  return { slug, reason: reason.trim(), apply: values.apply === true };
}

function retiredManifest(manifest: LabManifestV1, reason: string, date: string) {
  if (manifest.slug === 'home' || !['active', 'deprecated', 'retired'].includes(manifest.status))
    throw new Error('Only active or deprecated projects can enter retirement, never home.');
  const retired = manifest.dates.retired ?? date;
  for (const earlier of [
    manifest.dates.created,
    manifest.dates.published,
    manifest.dates.deprecated,
  ]) {
    if (earlier !== undefined && retired < earlier)
      throw new Error('Retirement cannot precede creation, publication, or deprecation.');
  }
  return LabManifestV1Schema.parse({
    ...manifest,
    status: 'retired',
    dates: { ...manifest.dates, retired },
    lifecycle: { ...manifest.lifecycle, reason },
  });
}

function sourceRepository(remote: string) {
  const url = new URL(remote.replace(/^git@([^:]+):/, 'https://$1/').replace(/\.git$/, ''));
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash)
    throw new Error('The origin must identify an HTTPS repository without credentials.');
  return url.href.replace(/\/$/, '');
}

async function preparationContext(
  root: string,
  input: Awaited<ReturnType<typeof retirementInput>>,
  date: string,
) {
  const git = (arguments_: string[]) =>
    execFileSync('git', arguments_, {
      cwd: root,
      encoding: 'utf8',
      timeout: 30000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  if ((await realpath(root)) !== (await realpath(git(['rev-parse', '--show-toplevel']).trim())))
    throw new Error('Run retirement from the repository root.');
  const relative = `apps/${input.slug}/lab.config.ts`;
  const file = path.join(root, relative);
  if (!(await lstat(file)).isFile()) throw new Error('The manifest must be a regular file.');
  const original = await readFile(file, 'utf8');
  const parsed = parseManifestSource(original, input.slug);
  const manifest = retiredManifest(parsed.manifest, input.reason, date);
  const directory = path.join(root, 'retired', input.slug);
  const exists = await lstat(directory).catch((error: unknown) => {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  });
  const stored = exists === undefined ? undefined : await verifyStoredArchive(directory);
  const sourceCommit = stored?.provenance.sourceCommit ?? git(['rev-parse', 'HEAD']).trim();
  git(['merge-base', '--is-ancestor', sourceCommit, 'HEAD']);
  const committed = parseManifestSource(git(['show', `${sourceCommit}:${relative}`]), input.slug);
  const expected = retiredManifest(
    committed.manifest,
    input.reason,
    manifest.dates.retired ?? date,
  );
  if (!isDeepStrictEqual(manifest, expected))
    throw new Error('Commit unrelated manifest changes before preparing retirement.');
  const identity = {
    manifest,
    sourceCommit,
    sourceRepository: sourceRepository(git(['remote', 'get-url', 'origin']).trim()),
  };
  if (
    stored !== undefined &&
    (!isDeepStrictEqual(stored.manifest, manifest) ||
      stored.provenance.sourceRepository !== identity.sourceRepository)
  )
    throw new Error('The stored archive belongs to a different retirement identity.');
  function checkSource() {
    const changed = [
      ...git(['diff', '--name-only', '-z', sourceCommit, '--']).split('\0'),
      ...git(['ls-files', '--others', '--exclude-standard', '-z']).split('\0'),
    ].filter(Boolean);
    if (changed.some((name) => name !== relative && !name.startsWith(`retired/${input.slug}/`)))
      throw new Error('Uncommitted or changed source cannot be attributed to the archive commit.');
  }
  checkSource();
  return { file, original, parsed, manifest, sourceCommit, identity, checkSource };
}

export async function retireLab(
  root: string,
  args: string[],
  date = new Date().toISOString().slice(0, 10),
) {
  const input = await retirementInput(args);
  const { file, original, parsed, manifest, sourceCommit, identity, checkSource } =
    await preparationContext(root, input, date);
  if (!input.apply)
    return {
      command: 'retire',
      ok: true,
      changed: false,
      phase: 'planned',
      manifest,
      sourceCommit,
    };
  const archive = await prepareRetirementArchive(root, identity);
  checkSource();
  const updated = parsed.update(manifest);
  const changed = updated !== original;
  if ((await readFile(file, 'utf8')) !== original)
    throw new Error(
      'The manifest changed during preparation; the archive and source were preserved.',
    );
  if (changed) {
    const temporary = `${file}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, updated, { flag: 'wx' });
      await rename(temporary, file);
    } finally {
      await rm(temporary, { force: true });
    }
  }
  return {
    command: 'retire',
    ok: true,
    changed: changed || archive.changed,
    phase: 'prepared',
    manifest,
    sourceCommit,
    archive: archive.directory,
    next: 'Review and deploy the archive through the production workflow. Keep app source until live verification succeeds.',
  };
}
