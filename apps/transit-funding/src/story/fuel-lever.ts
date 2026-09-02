import { RESTRICTED_FUEL_REVENUE } from '@/core/data/nevada';
import { FUEL_REVENUE_RESTRICTION } from '@/core/data/nevada';
import { sourced } from '@/core/sourced';
import type { RevenueLine } from '@/core/model';

/**
 * The money Article 9 Section 5 currently sends to roads, as a revenue line the
 * reader can switch on.
 *
 * It is `constitutional` because that is what it would take, and it produces
 * nothing before the earliest year that process could deliver — which is the
 * whole reason `earliestYear` exists on a revenue line rather than being an
 * annotation somewhere.
 *
 * The federal match ratio is a stated assumption, not a reported figure. It is
 * here because local dollars are a lever rather than a cost: money the region
 * puts up is money that pulls federal money behind it, and a diagram that hides
 * that understates what the change is worth.
 */
export const FUEL_LEVER: RevenueLine = {
  id: 'fuel',
  label: 'Fuel revenue',
  difficulty: 'constitutional',
  base: RESTRICTED_FUEL_REVENUE,
  growth: sourced({
    value: 0.005,
    unit: 'ratio',
    confidence: 'estimated',
    low: -0.005,
    high: 0.015,
    note: 'Fuel tax receipts are close to flat: rising vehicle efficiency offsets population growth.',
    source: 'Assumption, stated so it can be argued with',
    url: FUEL_REVENUE_RESTRICTION.url,
    retrieved: '2026-08-05',
  }),
  earliestYear: FUEL_REVENUE_RESTRICTION.earliestEffectiveYear,
  federalMatchRatio: sourced({
    value: 0.4,
    unit: 'ratio',
    confidence: 'estimated',
    low: 0.2,
    high: 0.8,
    note: 'Federal capital programmes commonly match a local dollar at well above this; the low end is deliberate.',
    source: 'Assumption, stated so it can be argued with',
    url: FUEL_REVENUE_RESTRICTION.url,
    retrieved: '2026-08-05',
  }),
};
