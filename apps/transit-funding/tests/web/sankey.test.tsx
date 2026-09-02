import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Sankey } from '../../src/sankey/Sankey.tsx';
import { DEFAULT_LAYOUT, layoutGraph } from '@/core/layout';
import { edgeId, type FlowGraph } from '@/core/flow';

const M = 1_000_000;

const graph: FlowGraph = {
  year: 2026,
  nodes: [
    { id: 'sales-tax', label: 'Sales tax', column: 0, difficulty: 'authorized' },
    { id: 'fuel', label: 'Fuel revenue', column: 0, difficulty: 'constitutional' },
    { id: 'pool', label: 'Budget', column: 1, difficulty: 'authorized' },
    { id: 'bus', label: 'Bus operations', column: 2, difficulty: 'authorized' },
  ],
  edges: [
    {
      id: edgeId('sales-tax', 'pool'),
      from: 'sales-tax',
      to: 'pool',
      value: 300 * M,
      confidence: 'reported',
    },
    {
      id: edgeId('fuel', 'pool'),
      from: 'fuel',
      to: 'pool',
      value: 100 * M,
      confidence: 'estimated',
    },
    {
      id: edgeId('pool', 'bus'),
      from: 'pool',
      to: 'bus',
      value: 400 * M,
      confidence: 'derived',
      unfunded: 100 * M,
    },
  ],
};

const layout = layoutGraph(graph, { ...DEFAULT_LAYOUT, scaleDomain: 600 * M });
const html = renderToStaticMarkup(
  <Sankey layout={layout} description="A test diagram." width={700} height={450} />,
);

describe('<Sankey>', () => {
  it('exposes itself as a single image with a full description', () => {
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="A test diagram."');
  });

  it('colours each band by how hard the money is to get', () => {
    expect(html).toContain('var(--viz-constitutional)');
    expect(html).toContain('var(--viz-authorized)');
  });

  // Brand law: components reference tokens, never hex. A raw colour here would
  // survive a token change and quietly diverge from the rest of the site.
  it('contains no raw hex colours', () => {
    expect(html).not.toMatch(/#[0-9a-fA-F]{6}/);
  });

  it('gives every node and edge a stable attribute derived from its id', () => {
    expect(html).toContain('data-node="fuel"');
    expect(html).toContain('data-edge="fuel-&gt;pool"');
  });

  it('labels every band directly, since hue cannot carry identity', () => {
    expect(html).toContain('Sales tax');
    expect(html).toContain('Fuel revenue');
    expect(html).toContain('Bus operations');
  });

  it('hatches an estimated flow', () => {
    expect(html).toContain('url(#viz-hatch)');
  });

  it('draws unfunded service as a separate hatched block', () => {
    expect(html).toContain('data-unfunded="bus"');
  });

  it('does not label the pooled budget, which needs no name beside it', () => {
    expect(html).not.toContain('>Budget<');
  });
});
