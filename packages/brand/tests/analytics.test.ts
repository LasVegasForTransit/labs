import { beforeEach, describe, expect, it, vi } from 'vitest';

const init = vi.fn();

vi.mock('@lasvegasfortransit/analytics', () => ({ init }));

import { LABS_SITE, initLabsAnalytics } from '../src/analytics';
import { labsAnalytics } from '../src/analytics/astro';

describe('Labs analytics', () => {
  beforeEach(() => init.mockReset());

  it('does not load analytics without a production token', async () => {
    await expect(initLabsAnalytics('')).resolves.toBeUndefined();
    expect(init).not.toHaveBeenCalled();
  });

  it('initializes the shared client for the Labs hostname', async () => {
    init.mockReturnValue({ enabled: true, track: vi.fn() });

    await expect(initLabsAnalytics('token')).resolves.toMatchObject({ enabled: true });
    expect(init).toHaveBeenCalledWith({ site: LABS_SITE, token: 'token' });
  });

  it('wraps the Astro integration with the same hostname', () => {
    expect(labsAnalytics().name).toBe('@lasvegasfortransit/analytics');
  });
});
