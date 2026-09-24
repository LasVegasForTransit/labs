import { execFileSync } from 'node:child_process';
import { z } from 'zod';

import { affectedProjects, type WorkspaceProject } from './affected.js';
import { parseManifestSource } from './manifest-source.js';
import { validateCatalogRecord } from './catalog-records.js';
import { parseMigrationHandoff } from './migration-handoff.js';

function git(root: string, args: string[]): string {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function resolveCommit(root: string, ref: string): string {
  return git(root, ['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`]).trim();
}

const packageSchema = z.object({
  name: z.string().min(1),
  dependencies: z.record(z.string(), z.string()).optional(),
  devDependencies: z.record(z.string(), z.string()).optional(),
  optionalDependencies: z.record(z.string(), z.string()).optional(),
  peerDependencies: z.record(z.string(), z.string()).optional(),
});

type RecordReader = (input: unknown, slug: string) => { status: string };

// The base commit's records passed the schema of their own time. The plan needs only each record's
// status, so a later tightening of the schema, which the head must meet, never fails a plan
// against an older base.
const baseRecordSchema = z.object({ slug: z.string(), status: z.enum(['retired', 'graduated']) });

function baseCatalogRecord(input: unknown, slug: string) {
  const record = baseRecordSchema.parse(input);
  if (record.slug !== slug) throw new Error(`Catalog record ${slug} names ${record.slug}.`);
  return record;
}

// Workspace packages moved from the `@lvbt/` scope to `@lasvegasfortransit/`. A base commit from
// before that rename still has the old scope committed, so base processing accepts either scope
// while head processing (the current scope) requires the new one. `scopeFor` resolves which scope
// a legacy-tolerant snapshot actually used, for building matching synthetic dependency names.
const currentScope = '@lasvegasfortransit';
const legacyScope = '@lvbt';

function labPackageName(scope: string, slug: string): string {
  return `${scope}/lab-${slug}`;
}

function cliPackageName(scope: string): string {
  return `${scope}/labs-cli`;
}

function scopeFor(name: string, slug: string, allowLegacyScope: boolean): string | undefined {
  if (name === labPackageName(currentScope, slug)) return currentScope;
  if (!allowLegacyScope) return undefined;
  return name === labPackageName(legacyScope, slug) ? legacyScope : undefined;
}

function addCatalogRecords(
  blobs: Map<string, readonly string[]>,
  read: (file: string) => string,
  {
    names,
    readRecord,
    allowLegacyScope,
  }: { names: Set<string>; readRecord: RecordReader; allowLegacyScope: boolean },
  projects: WorkspaceProject[],
) {
  const scope = allowLegacyScope ? legacyScope : currentScope;
  for (const file of [...blobs.keys()]
    .filter((file) => /^catalog\/[^/]+\.json$/.test(file))
    .sort()) {
    const slug = file.slice('catalog/'.length, -'.json'.length);
    const manifest = readRecord(JSON.parse(read(file)), slug);
    if (projects.some((project) => project.slug === slug))
      throw new Error(`Duplicate app and catalog ownership for ${slug}.`);
    if (manifest.status !== 'retired') continue;
    const name = labPackageName(scope, slug);
    if (names.has(name)) throw new Error(`Duplicate deployment identity for ${slug}.`);
    projects.push({
      name,
      directory: `retired/${slug}`,
      dependencies: [cliPackageName(scope)],
      slug,
      status: 'retired',
      archive: true,
    });
  }
}

function applyMigrationHandoffs(
  blobs: Map<string, readonly string[]>,
  read: (file: string) => string,
  projects: WorkspaceProject[],
) {
  for (const file of [...blobs.keys()]
    .filter((file) => /^migrations\/[^/]+\.json$/.test(file))
    .sort()) {
    const slug = file.slice('migrations/'.length, -'.json'.length);
    parseMigrationHandoff(JSON.parse(read(file)), slug);
    const project = projects.find((candidate) => candidate.slug === slug);
    if (project === undefined)
      throw new Error(`Migration handoff ${slug} has no operational app source.`);
    project.deploymentOwner = 'standalone';
  }
}

function workspaceAt(
  root: string,
  commit: string,
  readRecord: RecordReader = validateCatalogRecord,
  allowLegacyScope = false,
): WorkspaceProject[] {
  const entries = git(root, [
    'ls-tree',
    '-rz',
    commit,
    '--',
    'apps',
    'packages',
    'catalog',
    'migrations',
  ])
    .split('\0')
    .filter(Boolean);
  const blobs = new Map(
    entries.map((entry) => {
      const tab = entry.indexOf('\t');
      return [entry.slice(tab + 1), entry.slice(0, tab).split(' ')] as const;
    }),
  );
  function read(file: string): string {
    const entry = blobs.get(file);
    if (entry?.[0] !== '100644' && entry?.[0] !== '100755') {
      throw new Error(`Expected a regular committed file at ${file}.`);
    }
    return git(root, ['cat-file', 'blob', entry[2] ?? '']);
  }
  const names = new Set<string>();
  const projects = [...blobs.keys()]
    .filter((file) => /^(apps|packages)\/[^/]+\/package\.json$/.test(file))
    .sort()
    .map((file) => {
      const directory = file.slice(0, -'/package.json'.length);
      const pkg = packageSchema.parse(JSON.parse(read(file)));
      if (names.has(pkg.name)) throw new Error(`Duplicate workspace package: ${pkg.name}`);
      names.add(pkg.name);
      const dependencies = Object.keys({
        ...pkg.dependencies,
        ...pkg.devDependencies,
        ...pkg.optionalDependencies,
        ...pkg.peerDependencies,
      });
      const project: WorkspaceProject = { name: pkg.name, directory, dependencies };
      if (directory.startsWith('apps/')) {
        const slug = directory.slice('apps/'.length);
        const { manifest } = parseManifestSource(read(`${directory}/lab.config.ts`), slug);
        const scope = scopeFor(pkg.name, slug, allowLegacyScope);
        if (scope === undefined) throw new Error(`Package name must match lab slug ${slug}.`);
        project.slug = slug;
        project.status = manifest.status;
        if (manifest.status === 'retired') {
          project.archive = true;
          project.dependencies = [cliPackageName(scope)];
        }
      }
      return project;
    });
  addCatalogRecords(blobs, read, { names, readRecord, allowLegacyScope }, projects);
  applyMigrationHandoffs(blobs, read, projects);
  return projects;
}

export function deploymentPlan(root: string, refs: { base?: string; head?: string }) {
  const head = resolveCommit(root, refs.head ?? 'HEAD');
  const base = refs.base === undefined ? undefined : resolveCommit(root, refs.base);
  const current = workspaceAt(root, head);
  const previous = base === undefined ? [] : workspaceAt(root, base, baseCatalogRecord, true);
  const files =
    base === undefined
      ? git(root, ['ls-tree', '-rz', '--name-only', head]).split('\0').filter(Boolean)
      : git(root, ['diff', '--name-only', '--no-renames', '-z', base, head, '--'])
          .split('\0')
          .filter(Boolean);
  return { base: base ?? null, head, files, ...affectedProjects(current, files, previous) };
}
