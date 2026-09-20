import { afterEach, describe, expect, it } from 'vitest';
import type { ConfigEnv } from 'vite';

import config from '../../vite.config';

const environment: ConfigEnv = {
  command: 'build',
  mode: 'production',
  isSsrBuild: false,
  isPreview: false,
};
const configure = config;
const originalRequired = process.env.LVBT_REQUIRE_ANALYTICS;
const originalToken = process.env.PUBLIC_LVBT_CWA_TOKEN;

afterEach(() => {
  if (originalRequired === undefined) delete process.env.LVBT_REQUIRE_ANALYTICS;
  else process.env.LVBT_REQUIRE_ANALYTICS = originalRequired;
  if (originalToken === undefined) delete process.env.PUBLIC_LVBT_CWA_TOKEN;
  else process.env.PUBLIC_LVBT_CWA_TOKEN = originalToken;
});

describe('analytics build contract', () => {
  it('rejects a required production build without its public token', () => {
    process.env.LVBT_REQUIRE_ANALYTICS = '1';
    delete process.env.PUBLIC_LVBT_CWA_TOKEN;

    expect(() => configure(environment)).toThrow(
      'PUBLIC_LVBT_CWA_TOKEN is required when LVBT_REQUIRE_ANALYTICS=1.',
    );
  });

  it('exposes public environment variables when the token is present', () => {
    process.env.LVBT_REQUIRE_ANALYTICS = '1';
    process.env.PUBLIC_LVBT_CWA_TOKEN = 'test-token';

    expect(configure(environment)).toMatchObject({ envPrefix: ['VITE_', 'PUBLIC_'] });
  });
});
