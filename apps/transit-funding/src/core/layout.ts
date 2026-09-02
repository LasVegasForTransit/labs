import { DIFFICULTY_ORDER, type Column, type FlowGraph, type FlowNode } from './flow.ts';
import type { Confidence } from './sourced.ts';

/**
 * Sankey geometry, as a pure function of a graph.
 *
 * Deliberately hand-rolled rather than using `d3-sankey`. That library orders
 * nodes within a column by iteratively relaxing positions to minimise edge
 * crossings — which means a band can change position when a value changes. The
 * whole point of this diagram is that a reader watches one band grow while the
 * others hold still, so non-deterministic ordering is disqualifying. Here the
 * order is fixed by difficulty and declaration, and never depends on values.
 *
 * Living in `core` rather than the web app is also load-bearing: the Worker
 * renders share-card PNGs from this same code, so a card can never disagree
 * with the page it came from.
 */

export interface LayoutOptions {
  readonly width: number;
  readonly height: number;
  readonly padding: { top: number; right: number; bottom: number; left: number };
  readonly nodeWidth: number;
  /** Surface gap between stacked bands. Also the CVD secondary-encoding channel. */
  readonly nodeGap: number;
  /**
   * The dollar value that maps to the full plot height. Passed in rather than
   * derived per-graph on purpose: every state in a scene must share one scale,
   * or bands change size for reasons that have nothing to do with the argument.
   */
  readonly scaleDomain: number;
}

export const DEFAULT_LAYOUT: Omit<LayoutOptions, 'scaleDomain'> = {
  width: 700,
  height: 450,
  padding: { top: 40, right: 180, bottom: 30, left: 220 },
  nodeWidth: 13,
  nodeGap: 7,
};

export interface LaidOutNode {
  readonly id: string;
  readonly label: string;
  readonly column: Column;
  readonly difficulty: FlowNode['difficulty'];
  readonly x: number;
  readonly y: number;
  readonly width: number;
  /** Funded height only. */
  readonly height: number;
  /** Height of the unfunded remainder, drawn hatched directly below. */
  readonly unfundedHeight: number;
  readonly value: number;
}

export interface LaidOutEdge {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly value: number;
  readonly confidence: Confidence;
  readonly path: string;
}

export interface Layout {
  readonly year: number;
  readonly nodes: readonly LaidOutNode[];
  readonly edges: readonly LaidOutEdge[];
  readonly pxPerDollar: number;
}

function columnNodes(graph: FlowGraph, column: Column): readonly FlowNode[] {
  const inColumn = graph.nodes.filter((n) => n.column === column);
  if (column !== 0) return inColumn;
  // Sources stack by how hard the money is to get, so the diagram reads
  // top-to-bottom as "already ours" down to "needs an amendment".
  return [...inColumn]
    .map((n, i) => ({ n, i }))
    .sort((a, b) => {
      const d = DIFFICULTY_ORDER.indexOf(a.n.difficulty) - DIFFICULTY_ORDER.indexOf(b.n.difficulty);
      return d !== 0 ? d : a.i - b.i;
    })
    .map((x) => x.n);
}

function nodeValue(graph: FlowGraph, node: FlowNode): { funded: number; unfunded: number } {
  const edges =
    node.column === 2
      ? graph.edges.filter((e) => e.to === node.id)
      : graph.edges.filter((e) => e.from === node.id);
  return {
    funded: edges.reduce((t, e) => t + e.value, 0),
    unfunded: edges.reduce((t, e) => t + (e.unfunded ?? 0), 0),
  };
}

/** Cubic ribbon between two vertical spans. */
export function ribbonPath(
  x0: number,
  y0a: number,
  y0b: number,
  x1: number,
  y1a: number,
  y1b: number,
): string {
  const mid = (x1 - x0) * 0.5;
  const c0 = x0 + mid;
  const c1 = x1 - mid;
  return (
    `M${x0} ${y0a}C${c0} ${y0a},${c1} ${y1a},${x1} ${y1a}` +
    `L${x1} ${y1b}C${c1} ${y1b},${c0} ${y0b},${x0} ${y0b}Z`
  );
}

export function layoutGraph(graph: FlowGraph, options: LayoutOptions): Layout {
  const { width, height, padding, nodeWidth, nodeGap, scaleDomain } = options;
  const plotHeight = height - padding.top - padding.bottom;
  const pxPerDollar = scaleDomain > 0 ? plotHeight / scaleDomain : 0;

  const columnX: Record<Column, number> = {
    0: padding.left,
    1: Math.round((width - nodeWidth) / 2),
    2: width - padding.right - nodeWidth,
  };

  const nodes: LaidOutNode[] = [];
  for (const column of [0, 1, 2] as const) {
    let y = padding.top;
    for (const node of columnNodes(graph, column)) {
      const { funded, unfunded } = nodeValue(graph, node);
      const h = funded * pxPerDollar;
      const uh = unfunded * pxPerDollar;
      nodes.push({
        id: node.id,
        label: node.label,
        column,
        difficulty: node.difficulty,
        x: columnX[column],
        y,
        width: nodeWidth,
        height: h,
        unfundedHeight: uh,
        value: funded,
      });
      // Column 1 is the pooled budget: a single contiguous bar, no internal
      // gaps, because a gap there would imply money that is neither in nor out.
      y += h + uh + (column === 1 ? 0 : nodeGap);
    }
  }

  const byId = new Map(nodes.map((n) => [n.id, n]));
  // Separate cursors for each node's inbound and outbound side, both starting
  // at the node's own top edge.
  const cursor = new Map<string, number>();
  const take = (key: string, nodeId: string, amount: number): [number, number] => {
    const start = cursor.get(key) ?? byId.get(nodeId)?.y ?? 0;
    cursor.set(key, start + amount);
    return [start, start + amount];
  };

  // Edges are consumed in node declaration order on both ends, so an edge's
  // slot within a node is stable across states even as values change.
  const edges: LaidOutEdge[] = [];
  for (const edge of graph.edges) {
    const from = byId.get(edge.from);
    const to = byId.get(edge.to);
    if (!from || !to) continue;
    const h = edge.value * pxPerDollar;
    const [y0a, y0b] = take(`out:${edge.from}`, edge.from, h);
    const [y1a, y1b] = take(`in:${edge.to}`, edge.to, h);
    edges.push({
      id: edge.id,
      from: edge.from,
      to: edge.to,
      value: edge.value,
      confidence: edge.confidence,
      path: ribbonPath(from.x + from.width, y0a, y0b, to.x, y1a, y1b),
    });
  }

  return { year: graph.year, nodes, edges, pxPerDollar };
}
