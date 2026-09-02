import { describe, expect, it } from 'vitest';

import manifest from '../lab.config.js';

describe('home manifest', () => {
  it('owns the hostname catalog as the site profile', () => {
    expect(manifest).toMatchObject({ slug: 'home', profile: 'site', status: 'active' });
  });
});
