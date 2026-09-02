import { describe, expect, it } from 'vitest';

import { parseLabCommand, projectFilter } from '../src/cli.js';

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

  it('rejects unsupported commands with the documented command list', () => {
    expect(() => parseLabCommand(['launch', 'home'])).toThrow(/dev\|preview\|status/);
  });
});

describe('projectFilter', () => {
  it('derives the workspace package name from the permanent slug', () => {
    expect(projectFilter('transit-funding')).toBe('@lvbt/lab-transit-funding');
  });
});
