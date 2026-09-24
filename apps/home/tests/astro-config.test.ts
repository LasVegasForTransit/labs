import { expect, it, vi } from 'vitest';

import { LABS_SITE } from '@lvbt/brand/analytics';

const { lvbtAnalytics } = vi.hoisted(() => ({
  lvbtAnalytics: vi.fn(() => ({ name: '@lasvegasfortransit/analytics', hooks: {} })),
}));

vi.mock('@lasvegasfortransit/analytics/astro', () => ({ default: lvbtAnalytics }));

import config from '../astro.config';

it('measures the home page with the shared analytics integration for the Labs site', () => {
  expect(lvbtAnalytics).toHaveBeenCalledWith({ site: LABS_SITE });
  const names = [config.integrations ?? []]
    .flat(2)
    .map((integration) => (integration ? integration.name : undefined));
  expect(names).toContain('@lasvegasfortransit/analytics');
});
