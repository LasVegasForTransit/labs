import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const tokens = readFileSync(new URL('../src/tokens.css', import.meta.url), 'utf8');

describe('brand tokens', () => {
  it('publishes the LVBT brand primitives', () => {
    expect(tokens).toContain('--ink: #0f1115');
    expect(tokens).toContain('--paper: #f7f4ec');
    expect(tokens).toContain('--ember: #e5471a');
  });

  it('uses the vendored Public Sans font as the primary family', () => {
    expect(tokens).toContain("font-family: 'Public Sans Variable'");
    expect(tokens).toContain("--font-sans: 'Public Sans Variable'");
  });
});
