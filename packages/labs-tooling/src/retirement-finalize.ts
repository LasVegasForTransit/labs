import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  link,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rename,
  unlink,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { archiveChecksums } from './archive-files.js';
import { verifyStoredArchive } from './archive-store.js';
import { parseManifestSource } from './manifest-source.js';
import { verifyRetirementDeployment } from './retirement-deployment.js';

type Identity = Parameters<typeof verifyRetirementDeployment>[1];
type Verify = typeof verifyRetirementDeployment;

async function optionalStat(file: string) {
  return lstat(file).catch((error: unknown) => {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  });
}

async function finalizationState(root: string, identity: Identity) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(identity.slug) || identity.slug === 'home')
    throw new Error('Finalization requires a non-home lab slug.');
  if (!/^[a-f0-9]{40}$/.test(identity.commit))
    throw new Error('Provide the full deployment commit.');
  const git = (args: string[]) =>
    execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      timeout: 30000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  if ((await realpath(root)) !== (await realpath(git(['rev-parse', '--show-toplevel']).trim())))
    throw new Error('Run finalization from the repository root.');
  git(['merge-base', '--is-ancestor', identity.commit, 'HEAD']);
  const archive = await verifyStoredArchive(path.join(root, 'retired', identity.slug));
  const app = path.join(root, 'apps', identity.slug);
  const record = path.join(root, 'catalog', `${identity.slug}.json`);
  const appStat = await optionalStat(app);
  const recordStat = await optionalStat(record);
  if (appStat !== undefined && !appStat.isDirectory())
    throw new Error('App source must be a regular directory.');
  if (
    recordStat !== undefined &&
    (!recordStat.isFile() ||
      !isDeepStrictEqual(JSON.parse(await readFile(record, 'utf8')), archive.manifest))
  )
    throw new Error('A different catalog record already owns this slug.');
  if (appStat === undefined && recordStat === undefined)
    throw new Error('The retired project has no source or catalog record.');
  if (appStat !== undefined) {
    const manifest = parseManifestSource(
      await readFile(path.join(app, 'lab.config.ts'), 'utf8'),
      identity.slug,
    ).manifest;
    if (!isDeepStrictEqual(manifest, archive.manifest))
      throw new Error('The app manifest differs from the stored archive.');
  }
  const finalized = appStat === undefined;
  const changed = [
    ...git(['diff', '--name-only', '-z', identity.commit, '--']).split('\0'),
    ...git(['diff', '--cached', '--name-only', '-z', identity.commit, '--']).split('\0'),
    ...git(['ls-files', '--others', '--exclude-standard', '-z']).split('\0'),
  ].filter(Boolean);
  const allowed = (name: string) =>
    finalized &&
    (name.startsWith(`apps/${identity.slug}/`) || name === `catalog/${identity.slug}.json`);
  if (changed.some((name) => !allowed(name)))
    throw new Error('Commit or move uncommitted changes before finalization.');
  return {
    archive,
    app,
    record,
    finalized,
    recordExists: recordStat !== undefined,
    recoveryParent: path.resolve(root, git(['rev-parse', '--git-path', 'lvbt-retirements']).trim()),
  };
}

async function moveSource(
  state: Awaited<ReturnType<typeof finalizationState>>,
  deployment: unknown,
) {
  await mkdir(state.recoveryParent, { recursive: true });
  if (!(await lstat(state.recoveryParent)).isDirectory())
    throw new Error('Recovery needs a regular directory.');
  const recovery = await mkdtemp(
    path.join(state.recoveryParent, `${state.archive.manifest.slug}-`),
  );
  const content = `${JSON.stringify(state.archive.manifest, null, 2)}\n`;
  const stagedRecord = path.join(recovery, 'catalog.json');
  await writeFile(stagedRecord, content, { flag: 'wx' });
  await writeFile(
    path.join(recovery, 'handoff.json'),
    `${JSON.stringify({ deployment, manifest: state.archive.manifest }, null, 2)}\n`,
    { flag: 'wx' },
  );
  const catalog = path.dirname(state.record);
  await mkdir(catalog, { recursive: true });
  if (!(await lstat(catalog)).isDirectory())
    throw new Error('The catalog must be a regular directory.');
  let created = false;
  try {
    if (!state.recordExists) {
      await link(stagedRecord, state.record);
      created = true;
    }
    await rename(state.app, path.join(recovery, 'source'));
  } catch (error) {
    if (created && (await readFile(state.record, 'utf8')) === content) await unlink(state.record);
    throw new Error(`Finalization stopped. Inspect source and recovery at ${recovery}.`, {
      cause: error,
    });
  }
  return recovery;
}

export async function finalizeRetirement(
  root: string,
  identity: Identity,
  apply: boolean,
  verify: Verify = verifyRetirementDeployment,
) {
  const before = await finalizationState(root, identity);
  const deployment = await verify(root, identity);
  const state = await finalizationState(root, identity);
  const artifactHash = createHash('sha256')
    .update(archiveChecksums(state.archive.site))
    .digest('hex');
  if (
    deployment.artifactHash !== artifactHash ||
    !isDeepStrictEqual(before.archive.manifest, state.archive.manifest)
  )
    throw new Error('The archive changed during live verification.');
  if (!apply || state.finalized)
    return {
      command: 'retire',
      ok: true,
      changed: false,
      phase: state.finalized ? 'finalized' : 'finalization-planned',
      recovery: null,
      deployment,
    };
  const recovery = await moveSource(state, deployment);
  return { command: 'retire', ok: true, changed: true, phase: 'finalized', recovery, deployment };
}
