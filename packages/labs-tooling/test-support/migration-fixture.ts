import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import home from '../../../apps/home/lab.config.js';
import { migrationSource } from '../src/migration-source.js';
import type { MigrationFile } from '../src/migration-tree.js';

export async function withMigrationFixture(run: (root: string) => void | Promise<void>) {
  const source = migrationSource(fileURLToPath(new URL('../../..', import.meta.url)));
  const files = new Map<string, MigrationFile>();
  const prefixes = [
    '.lvbt/web-platform/',
    'packages/brand/',
    'packages/ui/',
    'packages/lab-runtime/',
  ];
  for (const [name, entry] of source.entries) {
    if (
      prefixes.some((prefix) => name.startsWith(prefix)) ||
      ['.lvbt/web-platform.json', 'pnpm-workspace.yaml', 'LICENSE'].includes(name)
    )
      files.set(name, { content: source.read(name), mode: entry.mode });
  }
  const app = 'apps/migration-example';
  const manifest = {
    ...home,
    slug: 'migration-example',
    title: 'Migration example',
    profile: 'app',
  };
  const additions = {
    [`${app}/lab.config.ts`]: `export default ${JSON.stringify(manifest)};\n`,
    [`${app}/package.json`]: JSON.stringify({
      name: '@lvbt/lab-migration-example',
      dependencies: {
        '@lvbt/ui': 'workspace:*',
        '@lvbt/brand': 'workspace:*',
        '@lvbt/lab-runtime': 'workspace:*',
      },
    }),
    [`${app}/wrangler.jsonc`]: JSON.stringify({ name: 'lvbt-labs-migration-example' }),
    [`${app}/docs/README.md`]: '# Migration example\n',
  };
  for (const [name, content] of Object.entries(additions))
    files.set(name, { content: Buffer.from(content), mode: '100644' });
  const root = await mkdtemp(path.join(os.tmpdir(), 'lvbt-migration-tree-'));
  try {
    execFileSync('git', ['init', '--quiet'], { cwd: root });
    const chunks: Buffer[] = [
      Buffer.from(
        'commit refs/heads/fixture\ncommitter Test <test@example.org> 1 +0000\ndata 7\nfixture\n',
      ),
    ];
    for (const [name, file] of files)
      chunks.push(
        Buffer.from(`M ${file.mode} inline ${name}\ndata ${file.content.length}\n`),
        file.content,
        Buffer.from('\n'),
      );
    execFileSync('git', ['fast-import', '--quiet'], {
      cwd: root,
      input: Buffer.concat([...chunks, Buffer.from('\n')]),
    });
    execFileSync('git', ['symbolic-ref', 'HEAD', 'refs/heads/fixture'], { cwd: root });
    execFileSync('git', ['remote', 'add', 'origin', 'https://github.com/LasVegasForTransit/labs'], {
      cwd: root,
    });
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
