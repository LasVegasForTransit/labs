import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { LabLifecycleNotice, LifecycleNotice } from '../src/index.js';

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

describe('LabLifecycleNotice', () => {
  it.each(['draft', 'active', 'graduated'])('renders nothing for %s projects', (status) => {
    expect(renderToStaticMarkup(<LabLifecycleNotice manifest={{ status }} />)).toBe('');
  });

  it('renders the sunset and successor from manifest metadata', () => {
    const markup = renderToStaticMarkup(
      <LabLifecycleNotice
        manifest={{
          status: 'deprecated',
          lifecycle: { reason: 'Data updates have ended.', sunset: '2026-12-01' },
          successor: { url: 'https://example.org/new', label: 'Replacement tool' },
        }}
      />,
    );
    expect(markup).toContain('Data updates have ended.');
    expect(markup).toContain('dateTime="2026-12-01"');
    expect(markup).toContain('December 1, 2026');
    expect(markup).toContain('href="https://example.org/new"');
  });

  it('fails clearly instead of hiding incomplete deprecation metadata', () => {
    expect(() =>
      renderToStaticMarkup(<LabLifecycleNotice manifest={{ status: 'deprecated' }} />),
    ).toThrow(/reason/);
  });

  it('renders a retired archive without promising a future sunset', () => {
    const markup = renderToStaticMarkup(
      <LabLifecycleNotice
        manifest={{
          status: 'retired',
          lifecycle: { reason: 'Archived for reference.', sunset: '2026-12-01' },
        }}
      />,
    );
    expect(markup).toContain('Retired');
    expect(markup).not.toContain('<time');
  });
});
