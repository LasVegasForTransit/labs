import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { discoverLabs, validateManifestForDirectory, type LabManifestV1 } from './manifest.js';
import { createLab } from './create.js';
import { deprecateLab } from './deprecate.js';

const commands = ['dev', 'preview', 'status'] as const;

type LabCommandName = (typeof commands)[number];

export interface ParsedLabCommand {
  command: LabCommandName;
  slug: string | undefined;
  json: boolean;
}

export function parseLabCommand(arguments_: readonly string[]): ParsedLabCommand {
  const [command, ...tokens] = arguments_;
  if (command === undefined || !commands.includes(command as LabCommandName)) {
    throw new Error(`Usage: pnpm lab <${commands.join('|')}> [slug] [--json]`);
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
  return `@lvbt/lab-${slug}`;
}

async function loadManifest(root: string, slug: string): Promise<LabManifestV1> {
  const configPath = path.join(root, 'apps', slug, 'lab.config.ts');
  if (!existsSync(configPath)) {
    throw new Error(`No lab exists at apps/${slug}.`);
  }
  const module = (await import(pathToFileURL(configPath).href)) as { default?: unknown };
  return validateManifestForDirectory(module.default, slug);
}

function runProjectScript(slug: string, script: 'dev' | 'preview'): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn('pnpm', ['--filter', projectFilter(slug), script], {
      stdio: 'inherit',
    });
    child.on('error', reject);
    child.on('exit', (code) => resolve(code ?? 1));
  });
}

async function main(): Promise<void> {
  try {
    if (process.argv[2] === 'deprecate') {
      const result = await deprecateLab(process.cwd(), process.argv.slice(3));
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return;
    }
    if (process.argv[2] === 'create') {
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

    await loadManifest(root, parsed.slug);
    process.exitCode = await runProjectScript(parsed.slug, parsed.command);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (process.argv.includes('--json')) {
      process.stdout.write(
        `${JSON.stringify({ command: process.argv[2], ok: false, changed: false, errors: [message] })}\n`,
      );
    } else {
      process.stderr.write(`${message}\n`);
    }
    process.exitCode = 2;
  }
}

const entry = process.argv[1];
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) {
  void main();
}
