import { access, readFile, readdir } from 'node:fs/promises';
import { expect, test } from 'vitest';

test('independent apps use the shared runtime without repository-management tooling', async () => {
  const apps = new URL('../../../apps/', import.meta.url);
  for (const entry of await readdir(apps, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === 'home') continue;
    const pkg = JSON.parse(await readFile(new URL(`${entry.name}/package.json`, apps), 'utf8')) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    const dependencies = { ...pkg.dependencies, ...pkg.devDependencies };
    expect(dependencies['@lvbt/labs-tooling'], entry.name).toBeUndefined();
    expect(dependencies['@lvbt/lab-runtime'], entry.name).toBe('workspace:*');
  }
});

test('repository operations consume the shared web platform implementation', async () => {
  const tooling = new URL('../', import.meta.url);
  const pkg = JSON.parse(await readFile(new URL('package.json', tooling), 'utf8')) as {
    dependencies: Record<string, string>;
  };
  expect(pkg.dependencies['@lvbt/web-platform']).toBe(
    'file:../../.lvbt/web-platform/packages/web-platform',
  );
  for (const file of [
    'cloudflare-read.ts',
    'cloudflare-release.ts',
    'deployment-checkout.ts',
    'doctor-check.ts',
    'doctor-cloudflare.ts',
    'doctor-github.ts',
    'github-read.ts',
    'pr-preview-config.ts',
    'pr-preview-upload.ts',
    'pr-preview.ts',
    'provision-environment.ts',
    'provision-reconcile.ts',
    'provision-routes.ts',
    'provision-variables.ts',
    'release-artifact.ts',
    'ruleset.ts',
  ]) {
    await expect(access(new URL(`src/${file}`, tooling))).rejects.toThrow();
  }
});
