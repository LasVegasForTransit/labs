/**
 * Provenance is structural here, not editorial.
 *
 * The argument this project makes is only worth as much as its numbers, and the
 * failure mode for a piece like this is a plausible figure nobody can trace. So
 * a number does not enter the model as a `number` — it enters as a `Sourced`,
 * and `sourced()` refuses to build one without a citation. There is deliberately
 * no escape hatch: if a figure cannot be sourced, it cannot be modelled, and the
 * absence shows up at the call site rather than in a footnote nobody reads.
 */

/**
 * How much weight a figure can bear.
 *
 * - `reported` — printed in a primary document (an adopted budget, an NTD filing).
 * - `derived`  — arithmetic on reported figures, with no judgement added.
 * - `estimated` — our judgement. Must carry a range; see `sourced()`.
 *
 * The renderer keys off this: reported figures draw solid, estimated ones draw
 * hatched, so a reader can see which parts of the argument are load-bearing
 * assumption without reading the methodology.
 */
export type Confidence = 'reported' | 'derived' | 'estimated';

export interface Sourced<T = number> {
  readonly value: T;
  /** e.g. `USD`, `USD/year`, `ratio`, `revenue-hours`. Carried so a figure can never be silently combined with one measured differently. */
  readonly unit: string;
  readonly low?: T;
  readonly high?: T;
  readonly confidence: Confidence;
  /** Document title, as a reader would cite it. */
  readonly source: string;
  readonly page?: number;
  readonly url: string;
  /** ISO `YYYY-MM-DD`. Public agency documents move; this records when we read it. */
  readonly retrieved: string;
  /**
   * The year whose dollars this figure is denominated in. Required whenever
   * `unit` starts with `USD`, because a 2026 dollar and a 2045 dollar are not
   * the same unit and the projection compounds nominal growth across twenty
   * years. Without this the real-versus-nominal error is invisible.
   */
  readonly dollarYear?: number;
  /** Why this figure is what it is, when that is not obvious from the source alone. */
  readonly note?: string;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export class UncitedFigureError extends Error {
  constructor(problem: string, input: Partial<Sourced<unknown>>) {
    super(`${problem} — figure: ${JSON.stringify(input)}`);
    this.name = 'UncitedFigureError';
  }
}

/**
 * The only way to build a `Sourced`. Throws rather than returning a result type:
 * these are authored constants, so a bad one is a bug in the dataset that should
 * fail the test run, not a condition callers branch on.
 */
export function sourced<T>(input: Sourced<T>): Sourced<T> {
  if (!input.source?.trim()) {
    throw new UncitedFigureError('no source document named', input);
  }
  if (!input.url?.trim()) {
    throw new UncitedFigureError('no source URL', input);
  }
  if (!ISO_DATE.test(input.retrieved ?? '')) {
    throw new UncitedFigureError('retrieved date must be ISO YYYY-MM-DD', input);
  }
  if (!input.unit?.trim()) {
    throw new UncitedFigureError('no unit', input);
  }
  if (input.unit.startsWith('USD') && input.dollarYear === undefined) {
    throw new UncitedFigureError('a USD figure must record the year its dollars are in', input);
  }

  // An estimate without a range is an assertion wearing a number's clothes. The
  // whole data posture for this project is "defensible estimates, cited ranges",
  // so the range is required exactly where judgement was applied.
  if (input.confidence === 'estimated' && (input.low === undefined || input.high === undefined)) {
    throw new UncitedFigureError('an estimated figure must carry low and high bounds', input);
  }

  if (typeof input.value === 'number') {
    const { low, high, value } = input as Sourced;
    if (low !== undefined && low > value) {
      throw new UncitedFigureError('low bound is above the value', input);
    }
    if (high !== undefined && high < value) {
      throw new UncitedFigureError('high bound is below the value', input);
    }
  }

  return Object.freeze({ ...input });
}

/** Unwrap for arithmetic. Named so that reaching past provenance is visible in a diff. */
export function amount(s: Sourced): number {
  return s.value;
}

/** Widest defensible reading of a figure — used for the range band on charts. */
export function bounds(s: Sourced): { low: number; high: number } {
  return { low: s.low ?? s.value, high: s.high ?? s.value };
}
