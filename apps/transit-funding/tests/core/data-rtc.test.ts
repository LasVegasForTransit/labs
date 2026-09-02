import { describe, expect, it } from 'vitest';
import {
  RTC_BASELINE,
  RTC_BASE_YEAR,
  RTC_PUBLISHED_OPERATING_EXPENSES,
  RTC_PUBLISHED_TOTAL_REVENUE,
} from '../../src/core/data/rtc-baseline.ts';
import { simulateYear, toGraph } from '../../src/core/model.ts';
import { amount } from '../../src/core/sourced.ts';
import { findImbalances } from '../../src/core/flow.ts';

/** Rounding in a published filing, not licence to be approximately right. */
const TOLERANCE = 0.005;

const base = simulateYear(RTC_BASELINE, { horizonYear: RTC_BASE_YEAR, levers: {} }, RTC_BASE_YEAR);

/**
 * The credibility gate. Everything the piece argues rests on the model
 * reproducing what RTC actually filed, so this is the test that has to pass
 * before any figure derived from the model is worth showing anyone.
 */
describe('the RTC baseline reproduces the published filing', () => {
  it('reproduces published total funding within 0.5%', () => {
    const published = amount(RTC_PUBLISHED_TOTAL_REVENUE);
    expect(Math.abs(base.totalRevenue - published) / published).toBeLessThan(TOLERANCE);
  });

  it('reproduces published operating expenses within 0.5%', () => {
    const published = amount(RTC_PUBLISHED_OPERATING_EXPENSES);
    const operating = base.cost
      .filter((c) => c.id !== 'capital-and-reserves')
      .reduce((t, c) => t + c.required, 0);
    expect(Math.abs(operating - published) / published).toBeLessThan(TOLERANCE);
  });

  // The four funding sources are separately reported figures. That they add to
  // the reported total is the filing's own arithmetic, and if a transcription
  // slipped this is where it shows.
  it('has revenue lines that sum to the published total exactly', () => {
    const summed = RTC_BASELINE.revenue.reduce((t, r) => t + amount(r.base), 0);
    expect(summed).toBe(amount(RTC_PUBLISHED_TOTAL_REVENUE));
  });

  it('has operating cost lines that sum to the published total exactly', () => {
    const summed = RTC_BASELINE.cost
      .filter((c) => c.id !== 'capital-and-reserves')
      .reduce((t, c) => t + amount(c.base), 0);
    expect(summed).toBe(amount(RTC_PUBLISHED_OPERATING_EXPENSES));
  });

  it('spends every funded dollar, so the diagram balances', () => {
    expect(findImbalances(toGraph(base))).toEqual([]);
    expect(base.gap).toBeCloseTo(0, 2);
  });

  it('has no placeholder figures left in it', () => {
    for (const line of RTC_BASELINE.revenue) expect(amount(line.base)).toBeGreaterThan(0);
    for (const line of RTC_BASELINE.cost) expect(amount(line.base)).toBeGreaterThan(0);
    expect(RTC_BASE_YEAR).toBeGreaterThan(2000);
  });

  // Every figure taken from the filing is reported, not estimated. Growth rates
  // are the judgement calls, and they carry ranges.
  it('marks filed figures as reported and assumptions as estimated', () => {
    for (const line of RTC_BASELINE.revenue) {
      expect(line.base.confidence).toBe('reported');
      expect(line.growth.confidence).toBe('estimated');
      expect(line.growth.low).toBeLessThan(line.growth.value);
    }
  });

  // Local and federal together clear every fixed line and leave vehicle
  // operations short, which is the shape of a real shortfall. Below that the
  // fixed lines start sharing what exists, which the model represents honestly
  // rather than pretending cannot happen.
  it('cuts vehicle operations, not mandated or contractual cost, when money is short', () => {
    const lean = simulateYear(
      {
        ...RTC_BASELINE,
        revenue: RTC_BASELINE.revenue.filter((r) => r.id === 'local' || r.id === 'federal'),
      },
      { horizonYear: RTC_BASE_YEAR, levers: {} },
      RTC_BASE_YEAR,
    );
    const ops = lean.cost.find((c) => c.id === 'vehicle-operations')!;
    expect(ops.funded).toBeLessThan(ops.required);
    for (const line of lean.cost.filter((c) => c.id !== 'vehicle-operations')) {
      expect(line.funded).toBeCloseTo(line.required, 2);
    }
  });
});
