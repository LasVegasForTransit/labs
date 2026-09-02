import { describe, expect, it } from 'vitest';
import {
  simulate,
  simulateYear,
  toGraph,
  type FiscalInputs,
  type Scenario,
} from '../../src/core/model.ts';
import { sourced } from '../../src/core/sourced.ts';
import { findImbalances } from '../../src/core/flow.ts';

const M = 1_000_000;

const usd = (value: number) =>
  sourced({
    value,
    unit: 'USD/year',
    dollarYear: 2026,
    confidence: 'reported' as const,
    source: 'Test fixture',
    url: 'https://example.org/fixture',
    retrieved: '2026-08-04',
  });

const ratio = (value: number) =>
  sourced({
    value,
    unit: 'ratio',
    confidence: 'derived' as const,
    source: 'Test fixture',
    url: 'https://example.org/fixture',
    retrieved: '2026-08-04',
  });

const inputs: FiscalInputs = {
  baseYear: 2026,
  revenue: [
    {
      id: 'sales-tax',
      label: 'Sales tax',
      difficulty: 'authorized',
      base: usd(300 * M),
      growth: ratio(0),
    },
    {
      id: 'fuel',
      label: 'Fuel revenue',
      difficulty: 'constitutional',
      base: usd(100 * M),
      growth: ratio(0),
      earliestYear: 2031,
      federalMatchRatio: ratio(0.5),
    },
  ],
  cost: [
    {
      id: 'bus',
      label: 'Bus operations',
      base: usd(250 * M),
      inflation: ratio(0),
      discretionary: true,
    },
    {
      id: 'para',
      label: 'Paratransit',
      base: usd(50 * M),
      inflation: ratio(0),
      discretionary: false,
    },
  ],
};

const off: Scenario = { horizonYear: 2035, levers: {} };
const on: Scenario = { horizonYear: 2035, levers: { fuel: 1 } };

describe('simulateYear()', () => {
  it('always counts authorized revenue, with no lever set', () => {
    expect(simulateYear(inputs, off, 2026).totalRevenue).toBe(300 * M);
  });

  it('leaves a lever out until the reader turns it on', () => {
    const ids = simulateYear(inputs, off, 2031).revenue.map((r) => r.id);
    expect(ids).not.toContain('fuel');
  });

  // A constitutional amendment needs two sessions and a ballot question. The
  // earliest year is a fact about procedure, not pessimism.
  it('honours the earliest year a lever could deliver money', () => {
    expect(simulateYear(inputs, on, 2030).revenue.map((r) => r.id)).not.toContain('fuel');
    expect(simulateYear(inputs, on, 2031).revenue.map((r) => r.id)).toContain('fuel');
  });

  it('drags in federal match as its own line', () => {
    const match = simulateYear(inputs, on, 2031).revenue.find((r) => r.id === 'fuel-match');
    expect(match?.amount).toBe(50 * M);
    expect(match?.difficulty).toBe('federal-match');
  });

  it('compounds growth from the base year', () => {
    const growing: FiscalInputs = {
      ...inputs,
      revenue: [{ ...inputs.revenue[0]!, growth: ratio(0.1) }],
    };
    expect(simulateYear(growing, off, 2028).totalRevenue).toBeCloseTo(300 * M * 1.21, 2);
  });

  it('reports a shortfall as a negative gap', () => {
    expect(simulateYear(inputs, off, 2026).gap).toBe(0);
    const lean: FiscalInputs = {
      ...inputs,
      revenue: [{ ...inputs.revenue[0]!, base: usd(200 * M) }],
    };
    expect(simulateYear(lean, off, 2026).gap).toBe(-100 * M);
  });

  // This is the mechanism behind a 42% service cut in a system nobody defunded:
  // paratransit is federally mandated and debt service is contractual, so bus
  // service is what absorbs a shortfall.
  it('pays non-discretionary costs first and cuts discretionary service', () => {
    const lean: FiscalInputs = {
      ...inputs,
      revenue: [{ ...inputs.revenue[0]!, base: usd(175 * M) }],
    };
    const year = simulateYear(lean, off, 2026);
    const para = year.cost.find((c) => c.id === 'para')!;
    const bus = year.cost.find((c) => c.id === 'bus')!;
    expect(para.funded).toBeCloseTo(50 * M, 2);
    expect(bus.required).toBe(250 * M);
    expect(bus.funded).toBeCloseTo(125 * M, 2);
  });

  it('never funds a line above what it requires', () => {
    const rich: FiscalInputs = {
      ...inputs,
      revenue: [{ ...inputs.revenue[0]!, base: usd(900 * M) }],
    };
    for (const line of simulateYear(rich, off, 2026).cost) {
      expect(line.funded).toBeLessThanOrEqual(line.required + 1e-6);
    }
  });
});

describe('simulate()', () => {
  it('produces one result per year, inclusive of both ends', () => {
    const projection = simulate(inputs, { horizonYear: 2030, levers: {} });
    expect(projection.years).toHaveLength(5);
    expect(projection.years[0]!.year).toBe(2026);
    expect(projection.years[4]!.year).toBe(2030);
  });

  it('reports a scale domain covering the largest year in the projection', () => {
    const projection = simulate(inputs, on);
    const largest = Math.max(...projection.years.flatMap((y) => [y.totalRevenue, y.totalRequired]));
    expect(projection.scaleDomain).toBe(largest);
  });
});

describe('toGraph()', () => {
  it('builds a balanced three-column graph', () => {
    const graph = toGraph(simulateYear(inputs, off, 2026));
    expect(findImbalances(graph)).toEqual([]);
    expect(graph.nodes.filter((n) => n.column === 1)).toHaveLength(1);
  });

  it('carries the shortfall through as unfunded service', () => {
    const lean: FiscalInputs = {
      ...inputs,
      revenue: [{ ...inputs.revenue[0]!, base: usd(175 * M) }],
    };
    const graph = toGraph(simulateYear(lean, off, 2026));
    const bus = graph.edges.find((e) => e.to === 'bus')!;
    expect(bus.unfunded).toBeCloseTo(125 * M, 2);
  });

  it('keeps edge ids stable across scenarios', () => {
    const a = toGraph(simulateYear(inputs, off, 2026)).edges.map((e) => e.id);
    const b = toGraph(simulateYear(inputs, on, 2031)).edges.map((e) => e.id);
    for (const id of a) expect(b).toContain(id);
  });
});
