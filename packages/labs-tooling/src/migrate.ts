import { execFileSync } from 'node:child_process';
import { realpath } from 'node:fs/promises';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { parseArgs } from 'node:util';
import { migrationTree } from './migration-tree.js';
import { exportMigration, initializeMigrationRepository } from './migration-export.js';

function migrationFlags(args: string[]) {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      slug: { type: 'string' },
      repository: { type: 'string' },
      output: { type: 'string' },
      prepare: { type: 'boolean' },
      apply: { type: 'boolean' },
      'dry-run': { type: 'boolean' },
      json: { type: 'boolean' },
    },
  });
  if (values.apply && values['dry-run']) throw new Error('Choose --apply or --dry-run.');
  if (values.apply && !values.prepare)
    throw new Error(
      'Ownership transfer is unavailable. Use --prepare --apply to export source only.',
    );
  if (positionals.length > 1 || (positionals.length > 0 && values.slug !== undefined))
    throw new Error('Provide one lab slug.');
  return { values, positionals };
}

export async function migrationInput(args: string[], ask?: (label: string) => Promise<string>) {
  const { values, positionals } = migrationFlags(args);
  const fields = {
    slug: values.slug ?? positionals[0],
    repository: values.repository,
    output: values.output,
  };
  const labels = {
    slug: 'Lab slug: ',
    repository: 'Destination GitHub repository (owner/name): ',
    output: 'Standalone directory outside Labs: ',
  };
  if (!values.json && (ask !== undefined || process.stdin.isTTY)) {
    const prompt =
      ask === undefined
        ? createInterface({ input: process.stdin, output: process.stderr })
        : undefined;
    try {
      const question = ask ?? prompt?.question.bind(prompt);
      if (question !== undefined)
        for (const key of ['slug', 'repository', 'output'] as const)
          fields[key] ??= await question(labels[key]);
    } finally {
      prompt?.close();
    }
  }
  const { slug, repository, output } = fields;
  if (!slug || !repository || !output)
    throw new Error('Provide --slug, --repository, and --output.');
  return { slug, repository, output, apply: values.apply === true };
}

export async function migrateLab(root: string, args: string[]) {
  const input = await migrationInput(args);
  const git = (arguments_: string[]) =>
    execFileSync('git', arguments_, {
      cwd: root,
      encoding: 'utf8',
      timeout: 30000,
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  const sourceRoot = await realpath(root);
  if (sourceRoot !== (await realpath(git(['rev-parse', '--show-toplevel']))))
    throw new Error('Run migration from the repository root.');
  const clean = () => {
    if (git(['status', '--porcelain', '--untracked-files=normal']))
      throw new Error('Migration requires a clean committed source tree.');
  };
  clean();
  const requested = path.resolve(root, input.output);
  const output = path.join(await realpath(path.dirname(requested)), path.basename(requested));
  if (output === sourceRoot || output.startsWith(`${sourceRoot}${path.sep}`))
    throw new Error('Choose an export directory outside Labs.');
  const tree = migrationTree(root, input.slug, input.repository);
  clean();
  if (git(['rev-parse', 'HEAD']) !== tree.commit)
    throw new Error('The source commit changed during migration planning.');
  const changed = input.apply ? await exportMigration(output, tree.files) : false;
  const initialized = input.apply ? await initializeMigrationRepository(output) : false;
  return {
    command: 'migrate',
    ok: true,
    changed: changed || initialized,
    phase: input.apply ? 'exported' : 'export-planned',
    sourceCommit: tree.commit,
    slug: input.slug,
    repository: input.repository,
    output,
    packages: tree.directories,
    deploymentOwner: 'labs',
    next: 'Bootstrap and validate the standalone repository before provisioning or transferring deployment ownership. Labs source and routes are unchanged.',
  };
}
