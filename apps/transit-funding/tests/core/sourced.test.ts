import { describe, expect, it } from 'vitest';
import { amount, bounds, sourced, UncitedFigureError } from '../../src/core/sourced.ts';

const valid = {
  value: 255_000_000,
  unit: 'USD/year',
  dollarYear: 2026,
  confidence: 'reported' as const,
  source: 'RTC FY2026 Adopted Budget',
  page: 47,
  url: 'https://example.org/rtc-fy2026.pdf',
  retrieved: '2026-08-04',
};

describe('sourced()', () => {
  it('accepts a fully cited figure and freezes it', () => {
    const figure = sourced(valid);
    expect(figure.value).toBe(255_000_000);
    expect(Object.isFrozen(figure)).toBe(true);
  });

  it('rejects a figure with no source document', () => {
    expect(() => sourced({ ...valid, source: '  ' })).toThrow(UncitedFigureError);
  });

  it('rejects a figure with no URL', () => {
    expect(() => sourced({ ...valid, url: '' })).toThrow(UncitedFigureError);
  });

  it('rejects a retrieved date that is not ISO YYYY-MM-DD', () => {
    expect(() => sourced({ ...valid, retrieved: '8/4/2026' })).toThrow(UncitedFigureError);
  });

  it('rejects a figure with no unit', () => {
    expect(() => sourced({ ...valid, unit: '' })).toThrow(UncitedFigureError);
  });

  // The whole data posture is "defensible estimates, cited ranges". The range is
  // required exactly where judgement was applied, and nowhere else.
  it('rejects an estimated figure that carries no range', () => {
    expect(() => sourced({ ...valid, confidence: 'estimated' })).toThrow(/must carry low and high/);
  });

  it('accepts an estimated figure that carries a range', () => {
    const figure = sourced({
      ...valid,
      confidence: 'estimated',
      low: 200_000_000,
      high: 300_000_000,
    });
    expect(bounds(figure)).toEqual({ low: 200_000_000, high: 300_000_000 });
  });

  it('rejects a low bound above the value', () => {
    expect(() => sourced({ ...valid, low: 999_000_000 })).toThrow(/low bound is above/);
  });

  it('rejects a high bound below the value', () => {
    expect(() => sourced({ ...valid, high: 1 })).toThrow(/high bound is below/);
  });

  it('reports bounds equal to the value when none are given', () => {
    expect(bounds(sourced(valid))).toEqual({ low: 255_000_000, high: 255_000_000 });
  });

  it('unwraps to a plain number for arithmetic', () => {
    expect(amount(sourced(valid))).toBe(255_000_000);
  });
});

describe('dollar-year discipline', () => {
  it('rejects a USD figure that does not say which year its dollars are in', () => {
    const { dollarYear: _omitted, ...withoutYear } = valid;
    _omitted;
    expect(() => sourced(withoutYear)).toThrow(/year its dollars are in/);
  });

  it('accepts a USD figure that records its dollar year', () => {
    expect(sourced({ ...valid, dollarYear: 2026 }).dollarYear).toBe(2026);
  });

  it('does not require a dollar year for a ratio', () => {
    const { dollarYear: _omitted, ...withoutYear } = valid;
    _omitted;
    expect(() => sourced({ ...withoutYear, value: 0.02, unit: 'ratio' })).not.toThrow();
  });
});
