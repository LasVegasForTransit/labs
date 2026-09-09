import { describe, expect, it } from 'vitest';

import { validateApplicationPackage, validateWorkspaceImport } from '../src/workspace.js';

describe('validateApplicationPackage', () => {
  it('requires the project lifecycle scripts', () => {
    expect(
      validateApplicationPackage('example', {
        scripts: { dev: 'vite', build: 'vite build' },
      }),
    ).toContain('build:archive');
  });
});

describe('validateWorkspaceImport', () => {
  it('rejects imports from one application into another', () => {
    expect(
      validateWorkspaceImport('apps/home/src/page.ts', '../../../apps/transit-funding/src/App'),
    ).toMatch(/must not import/i);
  });

  it('accepts imports from a shared package', () => {
    expect(validateWorkspaceImport('apps/home/src/page.ts', '@lvbt/brand/tokens.css')).toBeNull();
  });
});
