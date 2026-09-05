import { readFile, readdir } from 'node:fs/promises';
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
