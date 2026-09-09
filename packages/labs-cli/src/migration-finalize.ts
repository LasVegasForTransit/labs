import { execFileSync } from 'node:child_process';
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
import { z } from 'zod';
import { validateCatalogRecord } from './catalog-records.js';
import { parseManifestSource } from './manifest-source.js';
import {
  parseMigrationHandoff,
  verifyMigration,
  type MigrationVerifiedHandoffV1,
} from './migration-handoff.js';
import { migrationVerificationOperations } from './migration-handoff-operations.js';
import { LabManifestV1Schema, type LabManifestV1 } from './manifest.js';

const inputSchema = z
  .object({
    slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    graduated: z.iso.date(),
    apply: z.boolean(),
  })
  .strict();

interface Input {
  slug: string;
  graduated: string;
  apply: boolean;
}
interface Verification {
  version: string;
  artifactHash: string;
}
type Verify = (handoff: MigrationVerifiedHandoffV1) => Promise<Verification>;

async function optionalStat(file: string) {
  return lstat(file).catch((error: unknown) => {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  });
}

interface FinalizationPaths {
  app: string;
  handoffFile: string;
  catalogFile: string;
}

function graduatedManifest(
  manifest: LabManifestV1,
  handoff: MigrationVerifiedHandoffV1,
  graduated: string,
) {
  return LabManifestV1Schema.parse({
    ...manifest,
    status: 'graduated',
    dates: { ...manifest.dates, graduated },
    sourceRepository: `https://github.com/${handoff.repository}`,
  });
}

function repositoryCommands(root: string) {
  return (args: string[]) =>
    execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      timeout: 30000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
}

async function finalizedState(input: Input, paths: FinalizationPaths) {
  const manifest = validateCatalogRecord(
    JSON.parse(await readFile(paths.catalogFile, 'utf8')),
    input.slug,
  );
  if (manifest.status !== 'graduated' || manifest.dates.graduated !== input.graduated)
    throw new Error('A different catalog record already owns this slug.');
  return { finalized: true as const, manifest, ...paths };
}

async function activeFinalizationState(
  root: string,
  input: Input,
  paths: FinalizationPaths,
  git: (args: string[]) => string,
) {
  const handoff = parseMigrationHandoff(
    JSON.parse(await readFile(paths.handoffFile, 'utf8')),
    input.slug,
  );
  if (handoff.phase !== 'destination-verified')
    throw new Error('Verify and commit the destination deployment before finalization.');
  const committed = parseMigrationHandoff(
    JSON.parse(git(['show', `HEAD:migrations/${input.slug}.json`])),
    input.slug,
  );
  if (!isDeepStrictEqual(handoff, committed))
    throw new Error('Commit the verified migration handoff before finalization.');
  const sourceManifest = parseManifestSource(
    await readFile(path.join(paths.app, 'lab.config.ts'), 'utf8'),
    input.slug,
  ).manifest;
  const manifest = graduatedManifest(sourceManifest, handoff, input.graduated);
  if (git(['status', '--porcelain', '--untracked-files=normal']).trim())
    throw new Error('Commit or move uncommitted changes before finalization.');
  return {
    finalized: false as const,
    manifest,
    sourceManifest,
    handoff,
    ...paths,
    recoveryParent: path.resolve(root, git(['rev-parse', '--git-path', 'lvbt-migrations']).trim()),
  };
}

async function finalizationState(root: string, input: Input) {
  if (input.slug === 'home') throw new Error('Migration finalization requires a non-home lab.');
  const git = repositoryCommands(root);
  if ((await realpath(root)) !== (await realpath(git(['rev-parse', '--show-toplevel']).trim())))
    throw new Error('Run migration finalization from the repository root.');
  const paths = {
    app: path.join(root, 'apps', input.slug),
    handoffFile: path.join(root, 'migrations', `${input.slug}.json`),
    catalogFile: path.join(root, 'catalog', `${input.slug}.json`),
  };
  const [appStat, handoffStat, catalogStat] = await Promise.all([
    optionalStat(paths.app),
    optionalStat(paths.handoffFile),
    optionalStat(paths.catalogFile),
  ]);
  if (appStat === undefined && handoffStat === undefined && catalogStat?.isFile())
    return finalizedState(input, paths);
  if (!appStat?.isDirectory() || appStat.isSymbolicLink())
    throw new Error('Migration finalization requires a regular app source directory.');
  if (!handoffStat?.isFile() || handoffStat.isSymbolicLink())
    throw new Error('Migration finalization requires a regular handoff record.');
  if (catalogStat !== undefined) throw new Error('A catalog record already owns this slug.');
  return activeFinalizationState(root, input, paths, git);
}

async function moveMigrationSource(
  state: Exclude<Awaited<ReturnType<typeof finalizationState>>, { finalized: true }>,
) {
  await mkdir(state.recoveryParent, { recursive: true });
  if (!(await lstat(state.recoveryParent)).isDirectory())
    throw new Error('Migration recovery needs a regular directory.');
  const recovery = await mkdtemp(path.join(state.recoveryParent, `${state.handoff.slug}-`));
  const catalogContent = `${JSON.stringify(state.manifest, null, 2)}\n`;
  const stagedCatalog = path.join(recovery, 'catalog.json');
  await writeFile(stagedCatalog, catalogContent, { flag: 'wx' });
  await mkdir(path.dirname(state.catalogFile), { recursive: true });
  let catalogCreated = false;
  let handoffMoved = false;
  try {
    await link(stagedCatalog, state.catalogFile);
    catalogCreated = true;
    await rename(state.handoffFile, path.join(recovery, 'handoff.json'));
    handoffMoved = true;
    await rename(state.app, path.join(recovery, 'source'));
  } catch (error) {
    if (handoffMoved) await rename(path.join(recovery, 'handoff.json'), state.handoffFile);
    if (catalogCreated && (await readFile(state.catalogFile, 'utf8')) === catalogContent)
      await unlink(state.catalogFile);
    throw new Error(`Migration finalization stopped. Inspect recovery at ${recovery}.`, {
      cause: error,
    });
  }
  return recovery;
}

async function defaultVerify(root: string, handoff: MigrationVerifiedHandoffV1) {
  const result = await verifyMigration(
    { slug: handoff.slug, apply: false },
    migrationVerificationOperations(root, handoff.slug),
  );
  return {
    version: result.handoff.destinationVersion,
    artifactHash: result.handoff.artifactHash,
  };
}

export async function finalizeMigration(
  root: string,
  raw: Input,
  verify: Verify = (handoff) => defaultVerify(root, handoff),
) {
  const input = inputSchema.parse(raw);
  const before = await finalizationState(root, input);
  if (before.finalized)
    return {
      command: 'migrate',
      ok: true,
      changed: false,
      phase: 'graduated',
      recovery: null,
    };
  const deployment = await verify(before.handoff);
  if (
    deployment.version !== before.handoff.destinationVersion ||
    deployment.artifactHash !== before.handoff.artifactHash
  )
    throw new Error('The live destination differs from the verified migration handoff.');
  const state = await finalizationState(root, input);
  if (
    state.finalized ||
    !isDeepStrictEqual(before.handoff, state.handoff) ||
    !isDeepStrictEqual(before.sourceManifest, state.sourceManifest)
  )
    throw new Error('Migration source changed during live verification.');
  if (!input.apply)
    return {
      command: 'migrate',
      ok: true,
      changed: false,
      phase: 'finalization-planned',
      recovery: null,
      deployment,
    };
  const recovery = await moveMigrationSource(state);
  return {
    command: 'migrate',
    ok: true,
    changed: true,
    phase: 'graduated',
    recovery,
    deployment,
  };
}
