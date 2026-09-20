import type { AnalyticsHandle } from '@lvbt/analytics';

export const LABS_SITE = 'labs.lasvegasfortransit.org';

const environment = (
  import.meta as ImportMeta & {
    env: { readonly PUBLIC_LVBT_CWA_TOKEN?: string };
  }
).env;

export async function initLabsAnalytics(
  token = environment.PUBLIC_LVBT_CWA_TOKEN,
): Promise<AnalyticsHandle | undefined> {
  const normalized = token?.trim();
  if (!normalized) return undefined;

  const { init } = await import('@lvbt/analytics');
  return init({ site: LABS_SITE, token: normalized });
}
