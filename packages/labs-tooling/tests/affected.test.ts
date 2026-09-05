import { expect, test } from 'vitest';

import { affectedProjects, type WorkspaceProject } from '../src/affected.js';

const projects: WorkspaceProject[] = [
  { name: '@lvbt/brand', directory: 'packages/brand', dependencies: [] },
  { name: '@lvbt/ui', directory: 'packages/ui', dependencies: ['@lvbt/brand'] },
  {
    name: '@lvbt/lab-home',
    directory: 'apps/home',
    dependencies: ['@lvbt/brand'],
    slug: 'home',
    status: 'active',
  },
  {
    name: '@lvbt/lab-map',
    directory: 'apps/map',
    dependencies: ['@lvbt/ui'],
    slug: 'map',
    status: 'active',
  },
  {
    name: '@lvbt/lab-map-two',
    directory: 'apps/map-two',
    dependencies: [],
    slug: 'map-two',
    status: 'draft',
  },
];

test('shared changes rebuild direct and transitive dependents', () => {
  const result = affectedProjects(projects, ['packages/brand/src/tokens.css']);
  expect(result.packages).toEqual(['@lvbt/brand', '@lvbt/lab-home', '@lvbt/lab-map', '@lvbt/ui']);
  expect(result.deploy).toEqual(['map', 'home']);
});

test('app paths do not collide with longer slug prefixes', () => {
  expect(affectedProjects(projects, ['apps/map/src/main.tsx']).deploy).toEqual(['map']);
});

test('manifest changes rebuild home and keep drafts out of deployment', () => {
  const result = affectedProjects(projects, ['apps/map-two/lab.config.ts']);
  expect(result.apps).toEqual(['home', 'map-two']);
  expect(result.deploy).toEqual(['home']);
});

test('a removed package still invalidates its surviving dependents', () => {
  const current = projects.filter((project) => project.name !== '@lvbt/ui');
  expect(affectedProjects(current, ['packages/ui/src/control.tsx'], projects).deploy).toEqual([
    'map',
  ]);
});

test('removed apps update the catalog without scheduling missing source', () => {
  const current = projects.filter((project) => project.slug !== 'map');
  expect(affectedProjects(current, ['apps/map/lab.config.ts'], projects).deploy).toEqual(['home']);
});

test('toolchain and unknown root changes conservatively rebuild everything', () => {
  for (const file of ['pnpm-lock.yaml', '.lvbt/web-platform.json', 'new-build-config.ts']) {
    expect(affectedProjects(projects, [file]).apps).toEqual(['home', 'map', 'map-two']);
  }
});

test('root documentation does not trigger deployment', () => {
  expect(
    affectedProjects(projects, ['docs/development/how-to/create.md', 'README.md']).deploy,
  ).toEqual([]);
});

test('cycles terminate and include each dependent once', () => {
  const cycle = projects.map((project) =>
    project.name === '@lvbt/brand' ? { ...project, dependencies: ['@lvbt/ui'] } : project,
  );
  expect(affectedProjects(cycle, ['packages/ui/src/control.tsx']).deploy).toEqual(['map', 'home']);
});
