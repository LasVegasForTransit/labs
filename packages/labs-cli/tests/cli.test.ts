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
const repositoryRoot = fileURLToPath(new URL('../../..', import.meta.url));
const ptyRunner = fileURLToPath(new URL('../test-support/pty-run.py', import.meta.url));

function runCli(...arguments_: string[]) {
  return spawnSync(tsxPath, [cliPath, ...arguments_], {
    encoding: 'utf8',
  });
}

function runGuidedCli(steps: { expect: string; send: string }[], ...arguments_: string[]) {
  return spawnSync('python3', [ptyRunner, tsxPath, cliPath, ...arguments_], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    env: { ...process.env, FORCE_COLOR: '0' },
    input: JSON.stringify(steps),
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

  it('reports an applied creation failure as potentially changed', () => {
    const result = runCli(
      'create',
      '--manifest',
      '/definitely/missing/lvbt-create-manifest.json',
      '--apply',
      '--json',
    );

    expect(result.status).toBe(2);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout)).toMatchObject({
      command: 'create',
      ok: false,
      changed: null,
    });
  });
});

describe('guided command-line workflows', () => {
  it('collects a complete creation plan through a real terminal', () => {
    const steps = [
      ['Permanent slug (lowercase kebab-case):', 'guided-pty-example'],
      ['Project name:', 'Guided PTY example'],
      ['Public summary:', 'A generated project exercised through a real terminal.'],
      ['Profile (site or app):', 'site'],
      ['Kind (tool, visualization, or publication):', 'publication'],
      ['Maintainer GitHub usernames (comma-separated):', 'lvbt-maintainer'],
      ['Preview image public path:', '/guided-pty-example/preview.png'],
      ['Preview image description:', 'A preview of the generated project'],
      ['Content license:', 'CC-BY-4.0'],
      ['Data license:', 'CC0-1.0'],
      ['Asset license:', 'CC-BY-4.0'],
    ];

    const result = runGuidedCli(
      steps.map(([expect_, send]) => ({ expect: expect_ ?? '', send: send ?? '' })),
      'create',
      '--dry-run',
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Permanent slug (lowercase kebab-case):');
    expect(result.stdout).toContain('Asset license:');
    expect(result.stdout).toContain('Planned apps/guided-pty-example (site, draft, unlisted).');
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
