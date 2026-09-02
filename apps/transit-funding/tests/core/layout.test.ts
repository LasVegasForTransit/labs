import { describe, expect, it } from 'vitest';
import { DEFAULT_LAYOUT, layoutGraph, ribbonPath } from '../../src/core/layout.ts';
import { edgeId, type FlowGraph } from '../../src/core/flow.ts';

const M = 1_000_000;

function graph(salesTax: number, leverValue: number, unfunded = 0): FlowGraph {
  const nodes: FlowGraph['nodes'] = [
    { id: 'sales-tax', label: 'Sales tax', column: 0, difficulty: 'authorized' },
    { id: 'fuel', label: 'Fuel revenue', column: 0, difficulty: 'constitutional' },
    { id: 'pool', label: 'Budget', column: 1, difficulty: 'authorized' },
    { id: 'bus', label: 'Bus operations', column: 2, difficulty: 'authorized' },
  ];
  return {
    year: 2026,
    nodes,
    edges: [
      {
        id: edgeId('sales-tax', 'pool'),
        from: 'sales-tax',
        to: 'pool',
        value: salesTax,
        confidence: 'reported',
      },
      {
        id: edgeId('fuel', 'pool'),
        from: 'fuel',
        to: 'pool',
        value: leverValue,
        confidence: 'estimated',
      },
      {
        id: edgeId('pool', 'bus'),
        from: 'pool',
        to: 'bus',
        value: salesTax + leverValue,
        confidence: 'derived',
        unfunded,
      },
    ],
  };
}

const options = { ...DEFAULT_LAYOUT, scaleDomain: 600 * M };
const plotHeight = options.height - options.padding.top - options.padding.bottom;

describe('layoutGraph()', () => {
  it('scales band height by value against the shared domain', () => {
    const laid = layoutGraph(graph(300 * M, 0), options);
    const salesTax = laid.nodes.find((n) => n.id === 'sales-tax');
    expect(salesTax?.height).toBeCloseTo(plotHeight / 2, 5);
  });

  // The reason d3-sankey is not used. A band must never change position
  // because a value changed — only because the author reordered the data.
  it('keeps band order identical when values change', () => {
    const before = layoutGraph(graph(300 * M, 0), options);
    const after = layoutGraph(graph(200 * M, 250 * M), options);
    const ids = (l: typeof before) => l.nodes.filter((n) => n.column === 0).map((n) => n.id);
    expect(ids(after)).toEqual(ids(before));
  });

  it('orders sources by how hard the money is to get', () => {
    const laid = layoutGraph(graph(300 * M, 100 * M), options);
    const sources = laid.nodes.filter((n) => n.column === 0);
    expect(sources.map((n) => n.id)).toEqual(['sales-tax', 'fuel']);
    expect(sources[0]!.y).toBeLessThan(sources[1]!.y);
  });

  it('uses one shared scale, so a smaller total draws shorter', () => {
    const small = layoutGraph(graph(150 * M, 0), options);
    const large = layoutGraph(graph(300 * M, 0), options);
    const h = (l: typeof small) => l.nodes.find((n) => n.id === 'sales-tax')!.height;
    expect(h(large)).toBeCloseTo(h(small) * 2, 5);
  });

  it('gives every edge a stable id matching its endpoints', () => {
    const laid = layoutGraph(graph(300 * M, 100 * M), options);
    expect(laid.edges.map((e) => e.id)).toContain('fuel->pool');
  });

  it('stacks the pool contiguously, with no gap inside it', () => {
    const laid = layoutGraph(graph(300 * M, 100 * M), options);
    const pool = laid.nodes.find((n) => n.id === 'pool')!;
    expect(pool.height).toBeCloseTo((plotHeight * 400) / 600, 5);
  });

  it('separates stacked source bands by exactly the node gap', () => {
    const laid = layoutGraph(graph(300 * M, 100 * M), options);
    const [first, second] = laid.nodes.filter((n) => n.column === 0);
    expect(second!.y - (first!.y + first!.height)).toBeCloseTo(options.nodeGap, 5);
  });

  it('records unfunded height separately from funded height', () => {
    const laid = layoutGraph(graph(300 * M, 0, 150 * M), options);
    const bus = laid.nodes.find((n) => n.id === 'bus')!;
    expect(bus.height).toBeGreaterThan(0);
    expect(bus.unfundedHeight).toBeCloseTo(bus.height / 2, 5);
  });

  it('produces a closed ribbon path for every edge', () => {
    const laid = layoutGraph(graph(300 * M, 100 * M), options);
    for (const edge of laid.edges) {
      expect(edge.path.startsWith('M')).toBe(true);
      expect(edge.path.endsWith('Z')).toBe(true);
    }
  });

  it('is a pure function — same input, identical output', () => {
    const a = layoutGraph(graph(300 * M, 100 * M), options);
    const b = layoutGraph(graph(300 * M, 100 * M), options);
    expect(a).toEqual(b);
  });
});

describe('ribbonPath()', () => {
  it('draws a closed cubic band between two vertical spans', () => {
    expect(ribbonPath(0, 0, 10, 100, 20, 40)).toBe(
      'M0 0C50 0,50 20,100 20L100 40C50 40,50 10,0 10Z',
    );
  });
});
