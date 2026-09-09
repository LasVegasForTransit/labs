import { expect, test } from 'vitest';
import { deployProjects, type DeploymentOperations } from '../src/deployment.js';

function operations(events: string[], failure?: string): DeploymentOperations {
  return {
    build(packages) {
      events.push(`build:${packages.join(',')}`);
      if (failure === 'build') throw new Error('Build failed');
      return Promise.resolve();
    },
    deploy(slug) {
      events.push(`deploy:${slug}`);
      if (failure === slug) throw new Error('Upload failed');
      return Promise.resolve({ version: `${slug}-new`, previousVersion: `${slug}-old` });
    },
    verify(slug) {
      events.push(`verify:${slug}`);
      if (failure === `verify:${slug}`) throw new Error('Route verification failed');
      return Promise.resolve();
    },
  };
}
const plan = {
  packages: ['@lvbt/lab-home', '@lvbt/lab-map', '@lvbt/lab-budget'],
  deploy: ['home', 'map', 'budget'],
};

test('builds all affected artifacts before deploying and verifying apps, with home last', async () => {
  const events: string[] = [];
  const result = await deployProjects(plan, operations(events));
  expect(result.ok).toBe(true);
  expect(events).toEqual([
    'build:@lvbt/lab-home,@lvbt/lab-map,@lvbt/lab-budget',
    'deploy:map',
    'verify:map',
    'deploy:budget',
    'verify:budget',
    'deploy:home',
    'verify:home',
  ]);
  expect(result.results[0]?.receipt?.previousVersion).toBe('map-old');
});

test('a failed build prevents every deployment', async () => {
  const events: string[] = [];
  const result = await deployProjects(plan, operations(events, 'build'));
  expect(result.ok).toBe(false);
  expect(events).toHaveLength(1);
});

test.each(['map', 'verify:map'])(
  'continues independent apps after %s fails but withholds home',
  async (failure) => {
    const events: string[] = [];
    const result = await deployProjects(plan, operations(events, failure));
    expect(result.ok).toBe(false);
    expect(events).toContain('verify:budget');
    expect(events).not.toContain('deploy:home');
    expect(result.results.find((item) => item.slug === 'home')?.status).toBe('skipped');
    if (failure === 'verify:map')
      expect(result.results[0]?.receipt?.previousVersion).toBe('map-old');
  },
);

test('a documentation-only plan performs no build or deployment', async () => {
  const events: string[] = [];
  expect((await deployProjects({ packages: [], deploy: [] }, operations(events))).ok).toBe(true);
  expect(events).toEqual([]);
});

test('deploys an archive-only plan without a workspace build package', async () => {
  const events: string[] = [];
  expect((await deployProjects({ packages: [], deploy: ['map'] }, operations(events))).ok).toBe(
    true,
  );
  expect(events).toEqual(['build:', 'deploy:map', 'verify:map']);
});
