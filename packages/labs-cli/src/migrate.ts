import { execFileSync } from 'node:child_process';
import { realpath } from 'node:fs/promises';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { parseArgs } from 'node:util';
import { migrationTree } from './migration-tree.js';
import { exportMigration, initializeMigrationRepository } from './migration-export.js';
import {
  pauseMigration,
  transferMigration,
  type MigrationPauseOperations,
  type MigrationTransferOperations,
} from './migration-handoff.js';
import {
  migrationPauseOperations,
  migrationTransferOperations,
} from './migration-handoff-operations.js';

type MigrationPhase = 'prepare' | 'pause' | 'transfer';

function migrationFlags(args: string[]) {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      slug: { type: 'string' },
      repository: { type: 'string' },
      output: { type: 'string' },
      prepare: { type: 'boolean' },
      pause: { type: 'boolean' },
      transfer: { type: 'boolean' },
      'source-commit': { type: 'string' },
      apply: { type: 'boolean' },
      'dry-run': { type: 'boolean' },
      json: { type: 'boolean' },
    },
  });
  if (values.apply && values['dry-run']) throw new Error('Choose --apply or --dry-run.');
  if ([values.prepare, values.pause, values.transfer].filter(Boolean).length !== 1)
    throw new Error('Choose exactly one migration phase: --prepare, --pause, or --transfer.');
  if (positionals.length > 1 || (positionals.length > 0 && values.slug !== undefined))
    throw new Error('Provide one lab slug.');
  return { values, positionals };
}

type Question = (label: string) => Promise<string>;

async function promptedMigrationFields(
  fields: {
    slug: string | undefined;
    repository: string | undefined;
    output: string | undefined;
    sourceCommit: string | undefined;
  },
  phase: MigrationPhase,
  ask?: Question,
) {
  const prompt =
    ask === undefined
      ? createInterface({ input: process.stdin, output: process.stderr })
      : undefined;
  const question = ask ?? prompt?.question.bind(prompt);
  const labels = {
    slug: 'Lab slug: ',
    repository: 'Destination GitHub repository (owner/name): ',
    output: 'Standalone directory outside Labs: ',
    sourceCommit: 'Exported Labs source commit: ',
  };
  const projectField = phase === 'transfer' ? [] : ['repository' as const];
  const phaseField =
    phase === 'prepare' ? ['output' as const] : phase === 'pause' ? ['sourceCommit' as const] : [];
  try {
    if (question !== undefined)
      for (const key of ['slug' as const, ...projectField, ...phaseField])
        fields[key] ??= await question(labels[key]);
  } finally {
    prompt?.close();
  }
  return fields;
}

function validateMigrationFields(
  phase: MigrationPhase,
  fields: Awaited<ReturnType<typeof promptedMigrationFields>>,
  apply: boolean,
) {
  const { slug, repository, output, sourceCommit } = fields;
  if (!slug) throw new Error('Provide --slug.');
  if (phase === 'transfer') return { phase, slug, apply } as const;
  if (!repository) throw new Error('Provide --repository.');
  if (phase === 'prepare') {
    if (!output) throw new Error('Provide --output for migration preparation.');
    return { phase, slug, repository, output, apply } as const;
  }
  if (!sourceCommit) throw new Error('Provide --source-commit for migration pause.');
  return { phase, slug, repository, sourceCommit, apply } as const;
}

export async function migrationInput(args: string[], ask?: Question) {
  const { values, positionals } = migrationFlags(args);
  const phase: MigrationPhase = values.pause ? 'pause' : values.transfer ? 'transfer' : 'prepare';
  const fields = {
    slug: values.slug ?? positionals[0],
    repository: values.repository,
    output: values.output,
    sourceCommit: values['source-commit'],
  };
  const completed =
    !values.json && (ask !== undefined || process.stdin.isTTY)
      ? await promptedMigrationFields(fields, phase, ask)
      : fields;
  return validateMigrationFields(phase, completed, values.apply === true);
}

interface MigrationDependencies {
  pauseOperations?: (
    root: string,
    input: { slug: string; repository: string; sourceCommit: string },
  ) => MigrationPauseOperations;
  transferOperations?: (root: string, slug: string) => MigrationTransferOperations;
}

export async function migrateLab(
  root: string,
  args: string[],
  dependencies: MigrationDependencies = {},
) {
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
  if (input.phase === 'transfer')
    return transferMigration(
      { slug: input.slug, apply: input.apply },
      (dependencies.transferOperations ?? migrationTransferOperations)(root, input.slug),
    );
  if (input.phase === 'pause') {
    const current = git(['rev-parse', 'HEAD']);
    if (current !== input.sourceCommit)
      throw new Error('Re-export the current Labs commit before pausing deployment ownership.');
    migrationTree(root, input.slug, input.repository);
    clean();
    return pauseMigration(
      {
        slug: input.slug,
        repository: input.repository,
        sourceCommit: input.sourceCommit,
        apply: input.apply,
      },
      (dependencies.pauseOperations ?? migrationPauseOperations)(root, input),
    );
  }
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
