import { expect, test } from 'vitest';
import { migrationTree } from '../src/migration-tree.js';
import { migrationSource } from '../src/migration-source.js';
import { withMigrationFixture } from '../test-support/migration-fixture.js';

test(
  'exports one project with its pinned preset and keeps deployment gated',
  { timeout: 30000 },
  async () => {
    await withMigrationFixture((root) => {
      const source = migrationSource(root);
      const result = migrationTree(root, 'migration-example', 'LasVegasForTransit/example');
      expect(result.commit).toBe(source.commit);
      expect(result.directories).toEqual([
        'apps/migration-example',
        'packages/brand',
        'packages/lab-runtime',
        'packages/ui',
      ]);
      expect(result.files.get('apps/migration-example/wrangler.jsonc')?.content).toEqual(
        source.read('apps/migration-example/wrangler.jsonc'),
      );
      expect(result.files.has('apps/home/package.json')).toBe(false);
      expect(result.files.has('packages/labs-tooling/package.json')).toBe(false);
      expect(result.files.get('.lvbt/web-platform.json')?.content).toEqual(
        source.read('.lvbt/web-platform.json'),
      );
      expect(result.files.get('MIGRATED_FROM.md')?.content.toString()).toContain(source.commit);
      expect(result.files.get('README.md')?.content.toString()).toContain('# Migration example');
      expect(result.files.get('README.md')?.content.toString()).not.toContain('apps/site');
      expect(
        result.files.get('docs/development/tutorials/start-here.md')?.content.toString(),
      ).not.toContain('<this-repository>');
      expect(result.files.get('.github/workflows/deploy.yml')?.content.toString()).toContain(
        'LVBT_DEPLOYMENT_OWNER',
      );
      expect(result.files.get('.githooks/pre-commit')?.mode).toBe('100755');
      const pkg = JSON.parse(result.files.get('package.json')?.content.toString() ?? 'null') as {
        scripts: Record<string, string>;
        devDependencies: Record<string, string>;
      };
      expect(pkg.devDependencies['@lvbt/cli']).toBe('file:.lvbt/web-platform/packages/cli');
      expect(pkg.scripts['standards:check']).toContain('web-platform-cli.ts check');
    });
  },
);
