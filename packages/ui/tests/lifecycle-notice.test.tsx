import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { LifecycleNotice } from '../src/index.js';

describe('LifecycleNotice', () => {
  it('renders a deprecation reason and successor as an accessible status', () => {
    const markup = renderToStaticMarkup(
      <LifecycleNotice
        status="deprecated"
        reason="The source data is no longer maintained."
        successor={{ href: '/replacement', label: 'Open the maintained replacement' }}
      />,
    );

    expect(markup).toContain('role="status"');
    expect(markup).toContain('Deprecated');
    expect(markup).toContain('The source data is no longer maintained.');
    expect(markup).toContain('href="/replacement"');
  });
});
