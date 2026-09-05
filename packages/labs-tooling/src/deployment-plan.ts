import { execFileSync } from 'node:child_process';
import { z } from 'zod';

import { affectedProjects, type WorkspaceProject } from './affected.js';
import { parseManifestSource } from './manifest-source.js';

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

function workspaceAt(root: string, commit: string): WorkspaceProject[] {
  const entries = git(root, ['ls-tree', '-rz', commit, '--', 'apps', 'packages'])
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
  return [...blobs.keys()]
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
        if (pkg.name !== `@lvbt/lab-${slug}`)
          throw new Error(`Package name must match lab slug ${slug}.`);
        project.slug = slug;
        project.status = manifest.status;
      }
      return project;
    });
}

export function deploymentPlan(root: string, refs: { base?: string; head?: string }) {
  const head = resolveCommit(root, refs.head ?? 'HEAD');
  const base = refs.base === undefined ? undefined : resolveCommit(root, refs.base);
  const current = workspaceAt(root, head);
  const previous = base === undefined ? [] : workspaceAt(root, base);
  const files =
    base === undefined
      ? git(root, ['ls-tree', '-rz', '--name-only', head]).split('\0').filter(Boolean)
      : git(root, ['diff', '--name-only', '--no-renames', '-z', base, head, '--'])
          .split('\0')
          .filter(Boolean);
  return { base: base ?? null, head, files, ...affectedProjects(current, files, previous) };
}
