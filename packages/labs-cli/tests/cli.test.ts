import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  commandResultExitCode,
  parseLabCommand,
  projectCheckScripts,
  projectFilter,
  runProjectChecks,
} from '../src/cli.js';

const cliPath = fileURLToPath(new URL('../src/cli.ts', import.meta.url));
const tsxPath = fileURLToPath(new URL('../../../node_modules/.bin/tsx', import.meta.url));

function runCli(...arguments_: string[]) {
  return spawnSync(tsxPath, [cliPath, ...arguments_], {
    encoding: 'utf8',
  });
}

describe('command-line help', () => {
  it('documents every supported command and exits successfully', () => {
    const result = runCli('--help');

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    for (const command of [
      'create',
      'dev',
      'preview',
      'check',
      'status',
      'provision',
      'doctor',
      'deprecate',
      'retire',
      'migrate',
      'rollback',
    ]) {
      expect(result.stdout).toMatch(new RegExp(`^  ${command}(?: |$)`, 'm'));
    }
  });

  it('keeps invalid-command errors machine-readable with --json', () => {
    const result = runCli('launch', '--json');

    expect(result.status).toBe(2);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout)).toMatchObject({
      command: 'launch',
      ok: false,
      changed: false,
      errors: [expect.stringContaining('Usage: pnpm lab')],
    });
  });
});

describe('commandResultExitCode', () => {
  it('fails the process when a lifecycle operation reports failure', () => {
    expect(commandResultExitCode({ ok: false })).toBe(1);
    expect(commandResultExitCode({ ok: true })).toBeUndefined();
  });
});

describe('parseLabCommand', () => {
  it('parses a project command with structured output', () => {
    expect(parseLabCommand(['status', 'home', '--json'])).toEqual({
      command: 'status',
      slug: 'home',
      json: true,
    });
  });

  it('accepts global options before the positional slug', () => {
    expect(parseLabCommand(['status', '--json', 'transit-funding'])).toEqual({
      command: 'status',
      slug: 'transit-funding',
      json: true,
    });
  });

  it('accepts an explicit slug flag for agent calls', () => {
    expect(parseLabCommand(['status', '--slug', 'transit-funding', '--json'])).toEqual({
      command: 'status',
      slug: 'transit-funding',
      json: true,
    });
  });

  it('parses a focused project check', () => {
    expect(parseLabCommand(['check', 'transit-funding', '--json'])).toEqual({
      command: 'check',
      slug: 'transit-funding',
      json: true,
    });
  });

  it('rejects unsupported commands with the documented command list', () => {
    expect(() => parseLabCommand(['launch', 'home'])).toThrow(/dev\|preview\|check\|status/);
  });
});

describe('projectFilter', () => {
  it('derives the workspace package name from the permanent slug', () => {
    expect(projectFilter('transit-funding')).toBe('@lvbt/lab-transit-funding');
  });
});

describe('runProjectChecks', () => {
  it('runs the complete project gate in order', async () => {
    const scripts: string[] = [];
    const result = await runProjectChecks('home', (_slug, script) => {
      scripts.push(script);
      return Promise.resolve(0);
    });

    expect(scripts).toEqual(projectCheckScripts);
    expect(result).toMatchObject({ command: 'check', slug: 'home', ok: true, changed: false });
  });

  it('stops after the first failed gate', async () => {
    const scripts: string[] = [];
    const result = await runProjectChecks('home', (_slug, script) => {
      scripts.push(script);
      return Promise.resolve(script === 'test' ? 1 : 0);
    });

    expect(scripts).toEqual(['lint', 'check-types', 'test']);
    expect(result).toMatchObject({ ok: false, errors: ['test failed with exit code 1.'] });
  });
});
