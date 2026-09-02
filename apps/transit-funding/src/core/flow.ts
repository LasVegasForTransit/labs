import type { Confidence } from './sourced.ts';

/**
 * The money graph, for one year.
 *
 * Two properties here are load-bearing and expensive to retrofit, so they are
 * fixed from the first commit:
 *
 * 1. **Stable identity.** Nodes and edges are addressed by `id`, never by array
 *    position. The diagram has to *morph* between states — a reader watching a
 *    band grow is the entire argument — and a renderer can only tween what it
 *    can match across two graphs.
 * 2. **A year on every graph.** The piece projects to 2045. Retrofitting a time
 *    axis onto a shape that assumed a single year means touching everything.
 */

export type NodeId = string;

/**
 * What it would take to actually get this money. Hue encodes this, and nothing
 * else — see `docs/development/explanation/data-viz-palette.md`. Source identity
 * is carried by direct labels on the bands, because eight hues cannot pass
 * colour-vision separation and could not be told apart anyway.
 */
export type Difficulty =
  /** Already flowing. The baseline, and it recedes. */
  | 'authorized'
  /** A bill. Room tax, general fund, land value capture, pricing. */
  | 'legislative'
  /** A constitutional amendment. Two sessions and a ballot question. */
  | 'constitutional'
  /** Federal dollars that local action unlocks — the multiplier, not a cost. */
  | 'federal-match';

/** Fixed stacking order so a band never jumps position when a lever toggles. */
export const DIFFICULTY_ORDER: readonly Difficulty[] = [
  'authorized',
  'legislative',
  'constitutional',
  'federal-match',
];

/** 0 = where money comes from, 1 = the pooled budget, 2 = what it pays for. */
export type Column = 0 | 1 | 2;

export interface FlowNode {
  readonly id: NodeId;
  readonly label: string;
  readonly column: Column;
  readonly difficulty: Difficulty;
}

export interface FlowEdge {
  readonly id: string;
  readonly from: NodeId;
  readonly to: NodeId;
  /** USD in this graph's year, nominal. */
  readonly value: number;
  readonly confidence: Confidence;
  /**
   * The part of this flow with no revenue behind it. Drawn hatched, and it is
   * how the 2028 cliff renders: service that exists on paper and stops in fact.
   */
  readonly unfunded?: number;
}

export interface FlowGraph {
  readonly year: number;
  readonly nodes: readonly FlowNode[];
  readonly edges: readonly FlowEdge[];
}

export function edgeId(from: NodeId, to: NodeId): string {
  return `${from}->${to}`;
}

export function nodeById(graph: FlowGraph, id: NodeId): FlowNode | undefined {
  return graph.nodes.find((n) => n.id === id);
}

/** Total flowing out of a node, excluding the unfunded portion. */
export function outflow(graph: FlowGraph, id: NodeId): number {
  return graph.edges.filter((e) => e.from === id).reduce((t, e) => t + e.value, 0);
}

export function inflow(graph: FlowGraph, id: NodeId): number {
  return graph.edges.filter((e) => e.to === id).reduce((t, e) => t + e.value, 0);
}

export interface BalanceProblem {
  readonly nodeId: NodeId;
  readonly in: number;
  readonly out: number;
}

/**
 * A pool node that takes in more than it pays out (or the reverse) means the
 * dataset is wrong, and it would render as a diagram that silently lies about
 * where money went. Checked in tests rather than at render time.
 */
export function findImbalances(graph: FlowGraph, tolerance = 1): readonly BalanceProblem[] {
  const problems: BalanceProblem[] = [];
  for (const node of graph.nodes) {
    if (node.column !== 1) continue;
    const i = inflow(graph, node.id);
    const o = outflow(graph, node.id);
    if (Math.abs(i - o) > tolerance) problems.push({ nodeId: node.id, in: i, out: o });
  }
  return problems;
}

function usd(n: number): string {
  const millions = n / 1_000_000;
  if (Math.abs(millions) >= 1000) return `$${(millions / 1000).toFixed(2)} billion`;
  return `$${Math.round(millions)} million`;
}

/**
 * The chart's accessible description, generated from the same graph the chart
 * draws. Written here rather than hand-authored in the component so the two
 * cannot drift — a hand-written `aria-label` goes stale the first time a figure
 * is corrected, and nobody notices because nobody sees it.
 */
export function describeGraph(graph: FlowGraph): string {
  const on = (c: Column) => graph.nodes.filter((n) => n.column === c);
  const part = (n: FlowNode) => {
    const total = n.column === 2 ? inflow(graph, n.id) : outflow(graph, n.id);
    return `${n.label}, ${usd(total)}`;
  };
  const unfunded = graph.edges.reduce((t, e) => t + (e.unfunded ?? 0), 0);

  const sentences = [
    `Flow diagram of Southern Nevada transit money in ${graph.year}.`,
    `Sources: ${on(0).map(part).join('; ')}.`,
    `Uses: ${on(2).map(part).join('; ')}.`,
  ];
  if (unfunded > 0) {
    sentences.push(`${usd(unfunded)} of that service has no revenue behind it.`);
  }
  return sentences.join(' ');
}
