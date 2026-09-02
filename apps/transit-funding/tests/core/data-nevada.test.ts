import { describe, expect, it } from 'vitest';
import { FUEL_REVENUE_RESTRICTION, RESTRICTED_FUEL_REVENUE } from '../../src/core/data/nevada.ts';

describe('the fuel revenue restriction', () => {
  it('quotes the clause verbatim rather than paraphrasing it', () => {
    expect(FUEL_REVENUE_RESTRICTION.text.length).toBeGreaterThan(80);
    expect(FUEL_REVENUE_RESTRICTION.text).not.toContain('<');
    expect(FUEL_REVENUE_RESTRICTION.text).toContain('used exclusively for the');
  });

  it('names the article and section a reader could look up', () => {
    expect(FUEL_REVENUE_RESTRICTION.article).toMatch(/^\d+$/);
    expect(FUEL_REVENUE_RESTRICTION.section).toMatch(/^\d+$/);
  });

  it('records the one exception the section carves out', () => {
    expect(FUEL_REVENUE_RESTRICTION.statedException).toMatch(/ad valorem/);
  });

  // The earliest year is derived from how this very section was adopted, not
  // guessed: two consecutive legislatures then a popular vote.
  it('derives the earliest effective year from the section own adoption history', () => {
    const { precedent, earliestEffectiveYear, amendmentPath } = FUEL_REVENUE_RESTRICTION;
    expect(amendmentPath).toBe('constitutional-amendment');
    expect(precedent.agreed - precedent.proposed).toBe(2);
    expect(precedent.ratified - precedent.agreed).toBe(1);
    // Same shape applied forward from the 2027 session.
    expect(earliestEffectiveYear).toBe(2031);
  });

  it('carries a cited range on the restricted revenue, because it is an estimate', () => {
    expect(RESTRICTED_FUEL_REVENUE.confidence).toBe('estimated');
    expect(RESTRICTED_FUEL_REVENUE.low).toBeLessThan(RESTRICTED_FUEL_REVENUE.value);
    expect(RESTRICTED_FUEL_REVENUE.high).toBeGreaterThan(RESTRICTED_FUEL_REVENUE.value);
    expect(RESTRICTED_FUEL_REVENUE.value).toBeGreaterThan(0);
  });

  // A figure this uncertain must say which year's dollars it is in, or the
  // twenty-year projection silently mixes 2018 and 2045 money.
  it('records the dollar year of the collections it derives from', () => {
    expect(RESTRICTED_FUEL_REVENUE.dollarYear).toBe(2018);
  });
});
