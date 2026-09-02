import { describe, expect, it } from 'vitest';
import { blendResults } from '../../src/sankey/useTweenedResult.ts';
import type { YearResult } from '@/core/model';

const M = 1_000_000;

const make = (busFunded: number, fuel: number): YearResult => ({
  year: 2026,
  revenue: [
    { id: 'sales-tax', label: 'Sales tax', difficulty: 'authorized', amount: 300 * M },
    { id: 'fuel', label: 'Fuel revenue', difficulty: 'constitutional', amount: fuel },
  ],
  cost: [{ id: 'bus', label: 'Bus operations', required: 400 * M, funded: busFunded }],
  totalRevenue: 300 * M + fuel,
  totalRequired: 400 * M,
  gap: 300 * M + fuel - 400 * M,
});

describe('blendResults()', () => {
  it('returns the start state at t=0', () => {
    expect(blendResults(make(300 * M, 0), make(400 * M, 100 * M), 0)).toEqual(make(300 * M, 0));
  });

  it('returns the end state at t=1', () => {
    expect(blendResults(make(300 * M, 0), make(400 * M, 100 * M), 1)).toEqual(
      make(400 * M, 100 * M),
    );
  });

  it('interpolates each line independently', () => {
    const mid = blendResults(make(300 * M, 0), make(400 * M, 100 * M), 0.5);
    expect(mid.cost[0]!.funded).toBeCloseTo(350 * M, 2);
    expect(mid.revenue[1]!.amount).toBeCloseTo(50 * M, 2);
  });

  // Identity is what makes a morph a morph rather than a repaint.
  it('preserves line ids and order throughout', () => {
    const mid = blendResults(make(300 * M, 0), make(400 * M, 100 * M), 0.5);
    expect(mid.revenue.map((r) => r.id)).toEqual(['sales-tax', 'fuel']);
    expect(mid.cost.map((c) => c.id)).toEqual(['bus']);
  });

  // A lever that is off contributes no line at all, so it has to grow from zero
  // rather than pop into existence at full size.
  it('grows a line absent from the start state up from zero', () => {
    const from: YearResult = { ...make(300 * M, 0), revenue: [make(300 * M, 0).revenue[0]!] };
    const mid = blendResults(from, make(400 * M, 100 * M), 0.5);
    expect(mid.revenue.find((r) => r.id === 'fuel')?.amount).toBeCloseTo(50 * M, 2);
  });

  it('shrinks a line absent from the end state down to zero', () => {
    const to: YearResult = { ...make(400 * M, 0), revenue: [make(400 * M, 0).revenue[0]!] };
    const mid = blendResults(make(300 * M, 100 * M), to, 0.5);
    expect(mid.revenue.find((r) => r.id === 'fuel')?.amount).toBeCloseTo(50 * M, 2);
  });

  it('keeps the gap consistent with the blended totals', () => {
    const mid = blendResults(make(300 * M, 0), make(400 * M, 100 * M), 0.5);
    expect(mid.gap).toBeCloseTo(mid.totalRevenue - mid.totalRequired, 2);
  });

  it('places a line the end state introduces after the ones already present', () => {
    const from: YearResult = { ...make(300 * M, 0), revenue: [make(300 * M, 0).revenue[0]!] };
    const mid = blendResults(from, make(400 * M, 100 * M), 0.5);
    expect(mid.revenue.map((r) => r.id)).toEqual(['sales-tax', 'fuel']);
  });
});
