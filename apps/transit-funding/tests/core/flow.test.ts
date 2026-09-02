import { describe, expect, it } from 'vitest';
import {
  describeGraph,
  edgeId,
  findImbalances,
  inflow,
  outflow,
  type FlowGraph,
} from '../../src/core/flow.ts';

const M = 1_000_000;

const balanced: FlowGraph = {
  year: 2026,
  nodes: [
    { id: 'sales-tax', label: 'Sales tax', column: 0, difficulty: 'authorized' },
    { id: 'fares', label: 'Fares', column: 0, difficulty: 'authorized' },
    { id: 'pool', label: 'RTC transit budget', column: 1, difficulty: 'authorized' },
    { id: 'bus', label: 'Bus operations', column: 2, difficulty: 'authorized' },
  ],
  edges: [
    {
      id: edgeId('sales-tax', 'pool'),
      from: 'sales-tax',
      to: 'pool',
      value: 255 * M,
      confidence: 'reported',
    },
    {
      id: edgeId('fares', 'pool'),
      from: 'fares',
      to: 'pool',
      value: 55 * M,
      confidence: 'reported',
    },
    {
      id: edgeId('pool', 'bus'),
      from: 'pool',
      to: 'bus',
      value: 310 * M,
      confidence: 'derived',
    },
  ],
};

describe('edge identity', () => {
  it('derives a stable id from its endpoints', () => {
    expect(edgeId('a', 'b')).toBe('a->b');
  });
});

describe('flow totals', () => {
  it('sums what reaches a node', () => {
    expect(inflow(balanced, 'pool')).toBe(310 * M);
  });

  it('sums what leaves a node', () => {
    expect(outflow(balanced, 'sales-tax')).toBe(255 * M);
  });
});

describe('findImbalances()', () => {
  it('passes a pool whose inflow equals its outflow', () => {
    expect(findImbalances(balanced)).toEqual([]);
  });

  // A pool that takes in more than it pays out renders as a diagram that
  // silently lies about where the money went.
  it('flags a pool that does not balance', () => {
    const broken: FlowGraph = {
      ...balanced,
      edges: balanced.edges.map((e) => (e.to === 'bus' ? { ...e, value: 200 * M } : e)),
    };
    const problems = findImbalances(broken);
    expect(problems).toHaveLength(1);
    expect(problems[0]!.nodeId).toBe('pool');
    expect(problems[0]!.in).toBe(310 * M);
    expect(problems[0]!.out).toBe(200 * M);
  });

  it('ignores source and use nodes, which are not expected to balance', () => {
    expect(findImbalances(balanced).map((p) => p.nodeId)).not.toContain('sales-tax');
  });
});

describe('describeGraph()', () => {
  it('names the year, every source, and every use', () => {
    const text = describeGraph(balanced);
    expect(text).toContain('2026');
    expect(text).toContain('Sales tax, $255 million');
    expect(text).toContain('Fares, $55 million');
    expect(text).toContain('Bus operations, $310 million');
  });

  it('reports unfunded service when there is any', () => {
    const withGap: FlowGraph = {
      ...balanced,
      edges: balanced.edges.map((e) => (e.to === 'bus' ? { ...e, unfunded: 155 * M } : e)),
    };
    expect(describeGraph(withGap)).toContain(
      '$155 million of that service has no revenue behind it',
    );
  });

  it('says nothing about unfunded service when there is none', () => {
    expect(describeGraph(balanced)).not.toContain('no revenue behind it');
  });

  it('switches to billions above a thousand million', () => {
    const big: FlowGraph = {
      ...balanced,
      edges: balanced.edges.map((e) => (e.from === 'sales-tax' ? { ...e, value: 2_400 * M } : e)),
    };
    expect(describeGraph(big)).toContain('$2.40 billion');
  });
});
