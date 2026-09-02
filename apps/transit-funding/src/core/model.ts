import { amount, type Sourced } from './sourced.ts';
import { edgeId, type Difficulty, type FlowEdge, type FlowGraph, type FlowNode } from './flow.ts';

/**
 * The fiscal model. Pure, headless, and the thing that has to survive contact
 * with a hostile reader — a legislative fiscal analyst should be able to audit
 * this without opening a browser.
 */

export interface RevenueLine {
  readonly id: string;
  readonly label: string;
  readonly difficulty: Difficulty;
  /** Annual revenue at full intensity, in base-year dollars. */
  readonly base: Sourced;
  /** Compound annual growth, as a ratio (0.02 = 2%/yr). */
  readonly growth: Sourced;
  /**
   * First year this money could actually arrive, given the process it requires.
   * A constitutional amendment in Nevada needs two sessions and a ballot
   * question, so the earliest year is a fact about procedure, not optimism.
   */
  readonly earliestYear?: number;
  /** Federal dollars each local dollar from this line unlocks. */
  readonly federalMatchRatio?: Sourced;
}

export interface CostLine {
  readonly id: string;
  readonly label: string;
  readonly base: Sourced;
  readonly inflation: Sourced;
  /**
   * Whether this can absorb a shortfall. Paratransit is federally mandated and
   * debt service is contractual; when money runs out it is bus service that
   * stops, which is precisely how a 42% cut happens to a system nobody defunded.
   */
  readonly discretionary: boolean;
}

export interface FiscalInputs {
  readonly baseYear: number;
  readonly revenue: readonly RevenueLine[];
  readonly cost: readonly CostLine[];
}

export interface Scenario {
  readonly horizonYear: number;
  /** Lever id to intensity in 0..1. Missing or 0 means off. */
  readonly levers: Readonly<Record<string, number>>;
}

export interface RevenueResult {
  readonly id: string;
  readonly label: string;
  readonly difficulty: Difficulty;
  readonly amount: number;
}

export interface CostResult {
  readonly id: string;
  readonly label: string;
  /** What this line needs to maintain service. */
  readonly required: number;
  /** What there is money for. */
  readonly funded: number;
}

export interface YearResult {
  readonly year: number;
  readonly revenue: readonly RevenueResult[];
  readonly cost: readonly CostResult[];
  readonly totalRevenue: number;
  readonly totalRequired: number;
  /** Negative when revenue falls short of maintaining service. */
  readonly gap: number;
}

export interface Projection {
  readonly years: readonly YearResult[];
  /**
   * The largest single-year total anywhere in the projection. Every rendered
   * state shares this as its scale so bands only change size when the money
   * changes, never because the viewport rescaled.
   */
  readonly scaleDomain: number;
}

function compound(base: number, rate: number, years: number): number {
  return base * Math.pow(1 + rate, years);
}

function revenueFor(line: RevenueLine, year: number, intensity: number, baseYear: number): number {
  if (line.earliestYear !== undefined && year < line.earliestYear) return 0;
  if (intensity <= 0) return 0;
  return compound(amount(line.base) * intensity, amount(line.growth), year - baseYear);
}

export function simulateYear(inputs: FiscalInputs, scenario: Scenario, year: number): YearResult {
  const revenue: RevenueResult[] = [];

  for (const line of inputs.revenue) {
    // Baseline lines are always on; levers are off until the reader turns them
    // on. `authorized` is the marker for "this money already flows".
    const intensity = line.difficulty === 'authorized' ? 1 : (scenario.levers[line.id] ?? 0);
    const local = revenueFor(line, year, intensity, inputs.baseYear);
    if (local > 0) {
      revenue.push({ id: line.id, label: line.label, difficulty: line.difficulty, amount: local });
    }
    // The multiplier: local dollars are a lever, not a cost. Federal match is
    // its own revenue line so the diagram can show it being dragged in.
    if (line.federalMatchRatio && local > 0) {
      revenue.push({
        id: `${line.id}-match`,
        label: `Federal match on ${line.label.toLowerCase()}`,
        difficulty: 'federal-match',
        amount: local * amount(line.federalMatchRatio),
      });
    }
  }

  const totalRevenue = revenue.reduce((t, r) => t + r.amount, 0);

  const required = inputs.cost.map((line) => ({
    line,
    required: compound(amount(line.base), amount(line.inflation), year - inputs.baseYear),
  }));
  const totalRequired = required.reduce((t, r) => t + r.required, 0);

  // Non-discretionary lines are paid first. Whatever is left is shared out
  // across the discretionary ones in proportion to what they need.
  const fixed = required.filter((r) => !r.line.discretionary);
  const flexible = required.filter((r) => r.line.discretionary);
  const fixedTotal = fixed.reduce((t, r) => t + r.required, 0);
  const flexibleTotal = flexible.reduce((t, r) => t + r.required, 0);
  const availableForFlexible = Math.max(0, totalRevenue - fixedTotal);
  const ratio = flexibleTotal > 0 ? Math.min(1, availableForFlexible / flexibleTotal) : 1;

  // Non-discretionary lines draw first, each capped at what it needs. If even
  // they cannot be covered, they share what exists in proportion — a state the
  // model can represent honestly rather than pretending it cannot happen.
  const fixedFunded = (need: number): number =>
    Math.min(need, Math.max(0, totalRevenue) * (fixedTotal > 0 ? need / fixedTotal : 0));

  const cost: CostResult[] = required.map((r) => ({
    id: r.line.id,
    label: r.line.label,
    required: r.required,
    funded: r.line.discretionary ? r.required * ratio : fixedFunded(r.required),
  }));

  return {
    year,
    revenue,
    cost,
    totalRevenue,
    totalRequired,
    gap: totalRevenue - totalRequired,
  };
}

export function simulate(inputs: FiscalInputs, scenario: Scenario): Projection {
  const years: YearResult[] = [];
  for (let y = inputs.baseYear; y <= scenario.horizonYear; y++) {
    years.push(simulateYear(inputs, scenario, y));
  }
  const scaleDomain = years.reduce((m, y) => Math.max(m, y.totalRevenue, y.totalRequired), 0);
  return { years, scaleDomain };
}

const POOL_ID = 'rtc-transit-budget';

/** Turn one year of results into the diagram the reader actually sees. */
export function toGraph(result: YearResult, poolLabel = 'RTC transit budget'): FlowGraph {
  const nodes: FlowNode[] = [
    ...result.revenue.map<FlowNode>((r) => ({
      id: r.id,
      label: r.label,
      column: 0,
      difficulty: r.difficulty,
    })),
    { id: POOL_ID, label: poolLabel, column: 1, difficulty: 'authorized' },
    ...result.cost.map<FlowNode>((c) => ({
      id: c.id,
      label: c.label,
      column: 2,
      difficulty: 'authorized',
    })),
  ];

  const edges: FlowEdge[] = [
    ...result.revenue.map<FlowEdge>((r) => ({
      id: edgeId(r.id, POOL_ID),
      from: r.id,
      to: POOL_ID,
      value: r.amount,
      confidence: 'derived',
    })),
    ...result.cost.map<FlowEdge>((c) => ({
      id: edgeId(POOL_ID, c.id),
      from: POOL_ID,
      to: c.id,
      value: c.funded,
      confidence: 'derived',
      unfunded: Math.max(0, c.required - c.funded),
    })),
  ];

  return { year: result.year, nodes, edges };
}
