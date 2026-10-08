import { readReleaseConfiguration } from '@lasvegasfortransit/web-platform/release';
import { assertArchiveProfile } from './archive-release.js';
import { verifyArchiveReleaseSource } from './archive-release-source.js';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { z } from 'zod';
import type { LabManifestV1 } from './manifest.js';
import { parseManifestSource } from './manifest-source.js';
import { validateCatalogRecord } from './catalog-records.js';
import { migrationRecoveryVersion } from './migration-retained-identity.js';
import { parseMigrationHandoff } from './migration-handoff.js';

const execute = promisify(execFile);
interface ReleaseRequest {
  target: 'preview' | 'production';
  event: string;
  standalone: boolean;
  archive?: boolean;
}
export function assertLabReleasePolicy(
  manifest: Pick<LabManifestV1, 'slug' | 'status'>,
  request: ReleaseRequest,
): void {
  if (request.standalone) throw new Error(`${manifest.slug} has standalone deployment ownership.`);
  if (manifest.status === 'retired' && !request.archive)
    throw new Error(
      `${manifest.slug} requires its verified archive release, not a live source build.`,
    );
  if (request.archive && manifest.status !== 'retired')
    throw new Error('Archive release requires a retired lifecycle record.');
  if (manifest.status === 'graduated')
    throw new Error(`${manifest.slug} is graduated and has separate deployment ownership.`);
  if (
    manifest.status === 'draft' &&
    (request.target !== 'preview' || request.event !== 'workflow_dispatch')
  )
    throw new Error(`${manifest.slug} is draft: only an explicit manual preview is permitted.`);
  if (request.target === 'production' && request.event !== 'workflow_dispatch')
    throw new Error('Production promotion requires explicit workflow dispatch.');
}

interface SelectionOptions {
  target: ReleaseRequest['target'];
  event: string;
  app?: string | undefined;
  commit?: string | undefined;
  retainedCommit?: string | undefined;
  runId?: string | undefined;
  expectedVersion?: string | undefined;
}
interface SelectionDependencies {
  destinationOwner?: (repository: string) => Promise<string>;
}
async function handoffRecovery(
  root: string,
  app: string,
  context: {
    handoff: string | null;
    options: SelectionOptions;
    dependencies: SelectionDependencies;
  },
): Promise<boolean> {
  const { handoff, options, dependencies } = context;
  if (!handoff) return false;
  const record = parseMigrationHandoff(JSON.parse(handoff), app);
  const release = record.previousRelease;
  if (
    !release ||
    options.target !== 'production' ||
    options.event !== 'workflow_dispatch' ||
    (options.commit ?? options.retainedCommit) !== release.commit ||
    options.runId !== release.releaseId ||
    options.expectedVersion !== migrationRecoveryVersion(record)
  )
    throw new Error(
      'Standalone handoff recovery requires its verified retained run, source commit, and expected current phase version.',
    );
  let owner: string;
  try {
    owner = dependencies.destinationOwner
      ? await dependencies.destinationOwner(record.repository)
      : (
          await execute(
            'gh',
            ['variable', 'get', 'LVBT_DEPLOYMENT_OWNER', '--repo', record.repository],
            { cwd: root },
          )
        ).stdout;
  } catch (error) {
    throw new Error(
      'Cannot verify destination ownership. A maintainer must authorize the reviewed read-only LVBT_MIGRATION_GITHUB_TOKEN for that destination before handoff recovery.',
      { cause: error },
    );
  }
  if (owner.trim() !== 'false')
    throw new Error(
      'Disable and verify destination deployment ownership before retained Labs recovery.',
    );
  return true;
}
interface SelectedApp {
  app: string;
  appDirectory: string;
  artifactPrefix: string;
  acceptanceDirectory: string;
}
const profilesSchema = z.record(
  z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  z.object({ appDirectory: z.string().min(1), artifactPrefix: z.string().min(1) }),
);
async function source(root: string, file: string, commit?: string): Promise<string | null> {
  if (commit) {
    if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error('Use the verified full source commit.');
    const listed = await execute('git', ['ls-tree', '--name-only', commit, '--', file], {
      cwd: root,
    });
    if (!listed.stdout.trim()) return null;
    return (await execute('git', ['show', `${commit}:${file}`], { cwd: root })).stdout;
  }
  return readFile(path.join(root, file), 'utf8').catch((error: unknown) => {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  });
}
async function labAt(root: string, app: string, commit?: string) {
  const config = await source(root, `apps/${app}/lab.config.ts`, commit);
  if (config) return parseManifestSource(config, app).manifest;
  const record = await source(root, `catalog/${app}.json`, commit);
  if (record) return validateCatalogRecord(JSON.parse(record), app);
  throw new Error(`Release profile ${app} has no project manifest or catalog ownership record.`);
}

async function verifyCurrentOwnership(
  root: string,
  app: string,
  context: { options: SelectionOptions; archive: boolean; dependencies: SelectionDependencies },
) {
  const { options, archive, dependencies } = context;
  const current = await labAt(root, app);
  const handoff = await source(root, `migrations/${app}.json`);
  if (handoff) parseMigrationHandoff(JSON.parse(handoff), app);
  const recovery = await handoffRecovery(root, app, { handoff, options, dependencies });
  assertLabReleasePolicy(current, {
    ...options,
    standalone: Boolean(handoff) && !recovery,
    archive,
  });
  if (archive) await verifyArchiveReleaseSource(root, app);
}

async function selectedProfile(
  root: string,
  app: string,
  profile: { appDirectory: string; artifactPrefix: string },
  context: { options: SelectionOptions; dependencies: SelectionDependencies },
): Promise<SelectedApp | null> {
  const { options, dependencies } = context;
  const archive = profile.appDirectory === `.wrangler/archive-releases/${app}`;
  if (archive) assertArchiveProfile(app, await readReleaseConfiguration(root, process.env, app));
  if (options.commit) await verifyCurrentOwnership(root, app, { options, archive, dependencies });
  const manifest = await labAt(root, app, options.commit);
  const handoff = await source(root, `migrations/${app}.json`, options.commit);
  if (handoff) parseMigrationHandoff(JSON.parse(handoff), app);
  if (
    !options.app &&
    (handoff ||
      !['active', 'deprecated', ...(archive ? ['retired'] : [])].includes(manifest.status))
  )
    return null;
  const recovery = await handoffRecovery(root, app, { handoff, options, dependencies });
  assertLabReleasePolicy(manifest, {
    ...options,
    standalone: Boolean(handoff) && !recovery,
    archive,
  });
  if (archive) {
    const stored = await verifyArchiveReleaseSource(root, app, options.commit);
    if (JSON.stringify(stored.manifest) !== JSON.stringify(manifest))
      throw new Error('Archived manifest does not match retained lifecycle ownership.');
  }
  return { ...profile, app, acceptanceDirectory: 'packages/labs-cli' };
}

/** Product lifecycle selection only; it does not create resources, build, or deploy. */
export async function selectLabReleases(
  root: string,
  options: SelectionOptions,
  dependencies: SelectionDependencies = {},
) {
  const tooling = JSON.parse(await readFile(path.join(root, '.lvbt/tooling.json'), 'utf8')) as {
    release?: { apps?: unknown };
  };
  const profiles = profilesSchema.parse(tooling.release?.apps);
  if (options.app && !Object.hasOwn(profiles, options.app))
    throw new Error(`Unknown declared Labs release profile ${options.app}.`);
  const selected: SelectedApp[] = [];
  for (const [app, profile] of Object.entries(profiles)) {
    if (options.app && app !== options.app) continue;
    const release = await selectedProfile(root, app, profile, { options, dependencies });
    if (release) selected.push(release);
  }
  if (!selected.length)
    throw new Error('No Labs-owned source profile is eligible for this release.');
  return selected;
}
