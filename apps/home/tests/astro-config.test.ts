import { expect, it } from 'vitest';

import config from '../astro.config';

it('measures the home page with the shared analytics integration', () => {
  const names = [config.integrations ?? []]
    .flat(2)
    .map((integration) => (integration ? integration.name : undefined));
  expect(names).toContain('@lasvegasfortransit/analytics');
});
