import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { z } from 'zod';

const dependencies = z.record(z.string(), z.string()).optional();
export const migrationPackage = z
  .object({
    name: z.string(),
    dependencies,
    devDependencies: dependencies,
    peerDependencies: dependencies,
    optionalDependencies: dependencies,
  })
  .loose();

export function migrationSource(root: string) {
  const git = (args: string[]) =>
    execFileSync('git', args, {
      cwd: root,
      timeout: 30000,
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  const commit = git(['rev-parse', '--verify', 'HEAD^{commit}']).toString().trim();
  const entries = new Map<string, { mode: string; object: string }>();
  for (const record of git(['ls-tree', '-r', '--full-tree', '-z', commit])
    .toString()
    .split('\0')
    .filter(Boolean)) {
    const tab = record.indexOf('\t');
    const [mode, , object] = record.slice(0, tab).split(' ');
    if (mode === undefined || object === undefined || tab === -1)
      throw new Error('Invalid Git tree entry.');
    entries.set(record.slice(tab + 1), { mode, object });
  }
  function read(name: string) {
    const entry = entries.get(name);
    if (entry === undefined) throw new Error(`Missing committed migration input: ${name}`);
    if (!['100644', '100755'].includes(entry.mode))
      throw new Error(`Migration requires a regular file: ${name}`);
    return git(['cat-file', 'blob', entry.object]);
  }
  return { commit, entries, read };
}

interface PackageEntry {
  directory: string;
  pkg: z.infer<typeof migrationPackage>;
}

function localDependency(
  directory: string,
  name: string,
  specifier: string,
  packages: Map<string, PackageEntry>,
) {
  if (name === '@lvbt/labs-tooling')
    throw new Error(
      'Replace repository-management tooling with @lvbt/lab-runtime before migration.',
    );
  if (specifier.startsWith('workspace:')) {
    if (!/^workspace:[*^~]$/.test(specifier))
      throw new Error(`Unsupported workspace alias: ${name}`);
    const dependency = packages.get(name);
    if (dependency === undefined) throw new Error(`Unresolved shared dependency: ${name}`);
    return dependency;
  }
  if (specifier.startsWith('file:') || specifier.startsWith('link:')) {
    const target = path.posix.normalize(path.posix.join(directory, specifier.slice(5)));
    if (target.startsWith('.lvbt/web-platform/packages/')) return undefined;
    const dependency = [...packages.values()].find((entry) => entry.directory === target);
    if (dependency === undefined)
      throw new Error(`Local dependency escapes the migration tree: ${name}`);
    return dependency;
  }
  return undefined;
}

export function migrationPackages(source: ReturnType<typeof migrationSource>, slug: string) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug === 'home')
    throw new Error('Migration requires a non-home lab slug.');
  const packages = new Map<string, PackageEntry>();
  for (const name of source.entries.keys()) {
    if (!/^packages\/[^/]+\/package\.json$/.test(name)) continue;
    const pkg = migrationPackage.parse(JSON.parse(source.read(name).toString()));
    if (packages.has(pkg.name)) throw new Error(`Duplicate workspace package: ${pkg.name}`);
    packages.set(pkg.name, { directory: path.posix.dirname(name), pkg });
  }
  const app = migrationPackage.parse(
    JSON.parse(source.read(`apps/${slug}/package.json`).toString()),
  );
  if (packages.has(app.name)) throw new Error('The app name collides with a shared package.');
  const selected = new Map([[app.name, { directory: `apps/${slug}`, pkg: app }]]);
  for (const { directory, pkg } of selected.values()) {
    const groups = [
      pkg.dependencies,
      pkg.devDependencies,
      pkg.peerDependencies,
      pkg.optionalDependencies,
    ];
    for (const [name, specifier] of groups.flatMap((group) => Object.entries(group ?? {}))) {
      const dependency = localDependency(directory, name, specifier, packages);
      if (dependency !== undefined) selected.set(dependency.pkg.name, dependency);
    }
  }
  return [...selected.values()].map(({ directory }) => directory).sort();
}
