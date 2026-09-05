import { execFileSync } from 'node:child_process';
import ts from 'typescript';
import { z } from 'zod';
import { parseManifestSource } from './manifest-source.js';
import { migrationPackages, migrationSource } from './migration-source.js';
import { migrationDocs } from './migration-docs.js';

export interface MigrationFile {
  content: Buffer;
  mode: string;
  generated?: boolean;
}
type Tree = Map<string, MigrationFile>;

function jsonObject(content: string) {
  const result = ts.parseConfigFileTextToJson('migration.jsonc', content);
  if (result.error !== undefined)
    throw new Error('The preset contains invalid JSON configuration.');
  return z.record(z.string(), z.unknown()).parse(result.config);
}

function configureRoot(files: Tree, slug: string, repository: string) {
  const read = (name: string) => {
    const file = files.get(name);
    if (file === undefined) throw new Error(`Missing preset file: ${name}`);
    return file.content.toString();
  };
  const write = (name: string, content: string) =>
    files.set(name, { content: Buffer.from(content), mode: '100644', generated: true });
  const pkg = jsonObject(read('package.json'));
  pkg.name = repository.split('/')[1]?.toLowerCase();
  const dependencies = z.record(z.string(), z.string()).parse(pkg.devDependencies);
  for (const name of Object.keys(dependencies).filter((name) => name.startsWith('@lvbt/')))
    dependencies[name] = `file:.lvbt/web-platform/packages/${name.slice('@lvbt/'.length)}`;
  pkg.devDependencies = dependencies;
  dependencies['@playwright/test'] = 'catalog:';
  dependencies['prettier-plugin-astro'] = 'catalog:';
  const scripts = z.record(z.string(), z.string()).parse(pkg.scripts);
  scripts['standards:check'] = 'node .lvbt/web-platform/standards/web-platform-cli.ts check';
  scripts['standards:update'] = 'node .lvbt/web-platform/standards/web-platform-cli.ts update';
  scripts.check = `pnpm standards:check && ${scripts.check}`;
  scripts['build:archive'] = 'turbo run build:archive';
  scripts['test:archive'] = 'turbo run test:archive --concurrency=1';
  pkg.scripts = scripts;
  write('package.json', `${JSON.stringify(pkg, null, 2)}\n`);
  write(
    '.prettierignore',
    `${read('.prettierignore').trimEnd()}\n.lvbt/web-platform/\n**/dist-archive/\n**/test-results/\n**/playwright-report/\n`,
  );
  write(
    '.gitignore',
    `${read('.gitignore').trimEnd()}\n**/dist-archive/\n**/test-results/\n**/playwright-report/\n`,
  );
  const markdown = jsonObject(read('.markdownlint-cli2.jsonc'));
  markdown.ignores = [
    ...z.array(z.string()).parse(markdown.ignores),
    '.lvbt/web-platform',
    '**/dist-archive',
  ];
  write('.markdownlint-cli2.jsonc', `${JSON.stringify(markdown, null, 2)}\n`);
  const turbo = jsonObject(read('turbo.json'));
  const tasks = z.record(z.string(), z.unknown()).parse(turbo.tasks);
  tasks['build:archive'] = { dependsOn: ['^build'], outputs: ['dist-archive/**'] };
  tasks['test:archive'] = {
    dependsOn: ['build:archive'],
    cache: false,
    outputs: ['test-results/archive/**'],
  };
  turbo.tasks = tasks;
  write('turbo.json', `${JSON.stringify(turbo, null, 2)}\n`);
  const deploy = read('.github/workflows/deploy.yml');
  const anchor = '    name: Deploy\n    needs: validate';
  if (!deploy.includes(anchor))
    throw new Error('Review the preset deployment workflow before migration.');
  write(
    '.github/workflows/deploy.yml',
    deploy.replace(
      anchor,
      `    name: Deploy\n    if: vars.LVBT_DEPLOYMENT_OWNER == 'true'\n    needs: validate`,
    ),
  );
  write(
    '.github/workflows/ci.yml',
    `${read('.github/workflows/ci.yml').trimEnd()}\n\n      - name: Install Chromium\n        run: pnpm exec playwright install --with-deps chromium\n\n      - name: Production builds\n        run: pnpm build\n\n      - name: Browser acceptance\n        run: pnpm test:e2e\n\n      - name: Archive acceptance\n        run: pnpm test:archive\n`,
  );
  write('.lvbt/commit-scopes.txt', `${slug}\nbrand\nui\nruntime\ndocs\nci\ndx\n`);
}

function includesSource(name: string, directories: string[]) {
  return (
    name.startsWith('.lvbt/web-platform/') ||
    [
      '.lvbt/web-platform.json',
      'pnpm-workspace.yaml',
      'LICENSE',
      'docs/development/reference/brand-and-ui.md',
      'docs/security/reference/secrets.md',
    ].includes(name) ||
    directories.some((directory) => name.startsWith(`${directory}/`))
  );
}

export function migrationTree(root: string, slug: string, repository: string) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9-]*\/[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(repository))
    throw new Error('Provide a GitHub repository as owner/name.');
  const source = migrationSource(root);
  const directories = migrationPackages(source, slug);
  const manifestPath = `apps/${slug}/lab.config.ts`;
  const parsed = parseManifestSource(source.read(manifestPath).toString(), slug);
  if (['retired', 'graduated'].includes(parsed.manifest.status))
    throw new Error('Only projects with operational source can migrate.');
  const profile = parsed.manifest.profile === 'site' ? 'with-astro' : 'with-vite-react';
  const prefix = `.lvbt/web-platform/examples/${profile}/`;
  const files: Tree = new Map();
  for (const [name, entry] of source.entries) {
    if (name.startsWith(prefix) && !name.slice(prefix.length).startsWith('apps/')) {
      files.set(name.slice(prefix.length), { content: source.read(name), mode: entry.mode });
    }
    if (includesSource(name, directories))
      files.set(name, { content: source.read(name), mode: entry.mode });
  }
  configureRoot(files, slug, repository);
  for (const [name, content] of Object.entries(migrationDocs(parsed.manifest, repository)))
    files.set(name, { content: Buffer.from(content), mode: '100644', generated: true });
  const remote = execFileSync('git', ['remote', 'get-url', 'origin'], {
    cwd: root,
    encoding: 'utf8',
  }).trim();
  const origin = new URL(remote.replace(/^git@([^:]+):/, 'https://$1/').replace(/\.git$/, ''));
  if (
    origin.protocol !== 'https:' ||
    origin.username ||
    origin.password ||
    origin.search ||
    origin.hash
  )
    throw new Error('The source repository must use an HTTPS identity without credentials.');
  files.set('MIGRATED_FROM.md', {
    mode: '100644',
    generated: true,
    content: Buffer.from(
      `# Migration provenance\n\n${parsed.manifest.title} originates from [${origin.pathname.slice(1)}](${origin.href}).\n\nSource commit: \`${source.commit}\`. Source path: \`apps/${slug}\`.\n\nThe public [Labs URL](https://labs.lasvegasfortransit.org/${slug}/) and Worker\n\`lvbt-labs-${slug}\` remain unchanged. Deployment stays disabled until ownership transfer sets\n\`LVBT_DEPLOYMENT_OWNER\` to \`true\` in the destination repository.\n`,
    ),
  });
  return { commit: source.commit, directories, files };
}
