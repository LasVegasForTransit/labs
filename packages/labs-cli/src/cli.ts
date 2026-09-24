import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { discoverLabs, validateManifestForDirectory, type LabManifestV1 } from './manifest.js';
import type { rollbackLab } from './rollback-command.js';

const commands = ['dev', 'preview', 'check', 'status'] as const;
const supportedCommands = [
  'create',
  ...commands,
  'provision',
  'doctor',
  'deprecate',
  'retire',
  'migrate',
  'rollback',
] as const;
const usage = `pnpm lab <${supportedCommands.join('|')}> [options]`;
const help = `LVBT Labs project lifecycle and development tools.

Usage:
  pnpm lab <command> [options]

Commands:
  create                Plan or create a lab project
  dev <slug>            Start a lab's development server
  preview <slug>        Build and serve a lab locally
  check <slug>          Run a lab's complete validation gate
  status <slug>         Print a lab's validated manifest
  provision             Plan or apply managed infrastructure
  doctor [slug]         Inspect infrastructure without changing it
  deprecate <slug>      Plan or apply a deprecation
  retire <slug>         Prepare, verify, or finalize an archive
  migrate <slug>        Prepare, provision, transfer, verify, or finalize a migration
  rollback <slug>       Restore a previous Worker version

Common options:
  --json                Print structured output
  --dry-run             Plan without changing state
  --apply               Apply the planned change
  -h, --help            Show this help

Command flags and examples: docs/development/reference/commands.md
`;
export const projectCheckScripts = ['lint', 'check-types', 'test', 'build', 'test:e2e'] as const;

type LabCommandName = (typeof commands)[number];
type ProjectCheckScript = (typeof projectCheckScripts)[number];
type ProjectScript = 'dev' | 'preview' | ProjectCheckScript;
type ProjectRunner = (slug: string, script: ProjectScript) => Promise<number>;

export interface ParsedLabCommand {
  command: LabCommandName;
  slug: string | undefined;
  json: boolean;
}

export function parseLabCommand(arguments_: readonly string[]): ParsedLabCommand {
  const [command, ...tokens] = arguments_;
  if (command === undefined || !commands.includes(command as LabCommandName)) {
    throw new Error(`Usage: ${usage}`);
  }

  let slug: string | undefined;
  let json = false;
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === '--json') {
      json = true;
    } else if (token === '--slug') {
      const value = tokens[index + 1];
      if (value === undefined || value.startsWith('--')) {
        throw new Error('The --slug option requires a value.');
      }
      slug = value;
      index += 1;
    } else if (token?.startsWith('--slug=')) {
      slug = token.slice('--slug='.length);
    } else if (token?.startsWith('--')) {
      throw new Error(`Unsupported option: ${token}`);
    } else if (token !== undefined && slug === undefined) {
      slug = token;
    } else if (token !== undefined) {
      throw new Error(`Unexpected argument: ${token}`);
    }
  }

  return {
    command: command as LabCommandName,
    slug,
    json,
  };
}

export function projectFilter(slug: string): string {
  return `@lasvegasfortransit/lab-${slug}`;
}

async function loadManifest(root: string, slug: string): Promise<LabManifestV1> {
  const configPath = path.join(root, 'apps', slug, 'lab.config.ts');
  if (!existsSync(configPath)) {
    throw new Error(`No lab exists at apps/${slug}.`);
  }
  const module = (await import(pathToFileURL(configPath).href)) as { default?: unknown };
  return validateManifestForDirectory(module.default, slug);
}

function runProjectScript(slug: string, script: ProjectScript, quiet = false): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn('pnpm', ['--filter', projectFilter(slug), script], {
      stdio: quiet ? 'ignore' : 'inherit',
    });
    child.on('error', reject);
    child.on('exit', (code) => resolve(code ?? 1));
  });
}

export async function runProjectChecks(slug: string, run: ProjectRunner = runProjectScript) {
  const steps: { script: ProjectCheckScript; exitCode: number }[] = [];
  for (const script of projectCheckScripts) {
    const exitCode = await run(slug, script);
    steps.push({ script, exitCode });
    if (exitCode !== 0) {
      return {
        command: 'check' as const,
        slug,
        ok: false,
        changed: false,
        steps,
        errors: [`${script} failed with exit code ${exitCode}.`],
      };
    }
  }
  return { command: 'check' as const, slug, ok: true, changed: false, steps, errors: [] };
}

function printRollbackResult(result: Awaited<ReturnType<typeof rollbackLab>>) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ok) process.exitCode = 1;
}

export function commandResultExitCode(result: { ok: boolean }): 1 | undefined {
  return result.ok ? undefined : 1;
}

function printLifecycleResult(result: { ok: boolean }) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = commandResultExitCode(result);
}

function printCommandError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (process.argv.includes('--json')) {
    const changed =
      ['create', 'retire', 'migrate', 'provision'].includes(process.argv[2] ?? '') &&
      process.argv.includes('--apply')
        ? null
        : false;
    process.stdout.write(
      `${JSON.stringify({ command: process.argv[2], ok: false, changed, errors: [message] })}\n`,
    );
  } else {
    process.stderr.write(`${message}\n`);
  }
  process.exitCode = 2;
}

async function runInfrastructureCommand() {
  const command = process.argv[2];
  if (command !== 'provision' && command !== 'doctor') return false;
  const run =
    command === 'provision'
      ? (await import('./provision.js')).provision
      : (await import('./doctor.js')).doctor;
  const result = await run(process.cwd(), process.argv.slice(3));
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ok) process.exitCode = 1;
  return true;
}

async function runProjectCheckCommand(root: string, parsed: ParsedLabCommand) {
  if (parsed.command !== 'check' || parsed.slug === undefined) return false;
  await loadManifest(root, parsed.slug);
  const run = parsed.json
    ? (slug: string, script: ProjectScript) => runProjectScript(slug, script, true)
    : runProjectScript;
  const result = await runProjectChecks(parsed.slug, run);
  process.stdout.write(`${JSON.stringify(result, null, parsed.json ? 0 : 2)}\n`);
  if (!result.ok) process.exitCode = 1;
  return true;
}

async function main(): Promise<void> {
  try {
    if (await runInfrastructureCommand()) return;
    if (process.argv[2] === 'migrate') {
      const { migrateLab } = await import('./migrate.js');
      const result = await migrateLab(process.cwd(), process.argv.slice(3));
      printLifecycleResult(result);
      return;
    }
    if (process.argv[2] === 'retire') {
      const { retireLab } = await import('./retire.js');
      const result = await retireLab(process.cwd(), process.argv.slice(3));
      printLifecycleResult(result);
      return;
    }
    if (process.argv[2] === 'rollback') {
      const { rollbackLab } = await import('./rollback-command.js');
      printRollbackResult(await rollbackLab(process.cwd(), process.argv.slice(3)));
      return;
    }
    if (process.argv[2] === 'deprecate') {
      const { deprecateLab } = await import('./deprecate.js');
      const result = await deprecateLab(process.cwd(), process.argv.slice(3));
      printLifecycleResult(result);
      return;
    }
    if (process.argv[2] === 'create') {
      const { createLab } = await import('./create.js');
      await createLab(process.cwd(), process.argv.slice(3));
      return;
    }
    const parsed = parseLabCommand(process.argv.slice(2));
    if (parsed.slug === undefined) {
      throw new Error(`The ${parsed.command} command requires a lab slug.`);
    }

    const root = process.cwd();
    if (parsed.command === 'status') {
      const manifest = (await discoverLabs(root)).find(
        (candidate) => candidate.slug === parsed.slug,
      );
      if (manifest === undefined) throw new Error(`No lab exists with slug ${parsed.slug}.`);
      const result = {
        command: 'status',
        ok: true,
        changed: false,
        results: [{ manifest }],
        errors: [],
      };
      process.stdout.write(`${JSON.stringify(result, null, parsed.json ? 0 : 2)}\n`);
      return;
    }

    if (await runProjectCheckCommand(root, parsed)) return;
    if (parsed.command === 'check') return;
    await loadManifest(root, parsed.slug);
    process.exitCode = await runProjectScript(parsed.slug, parsed.command);
  } catch (error) {
    printCommandError(error);
  }
}

const entry = process.argv[1];
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) {
  if (process.argv[2] === '--help' || process.argv[2] === '-h') process.stdout.write(help);
  else void main();
}
