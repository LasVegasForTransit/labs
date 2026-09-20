import lvbtAnalytics from '@lasvegasfortransit/analytics/astro';

import { LABS_SITE } from '../analytics';

export function labsAnalytics() {
  return lvbtAnalytics({ site: LABS_SITE });
}
