import { expect, test } from 'vitest';
import { configureMigrationRelease } from '../src/migration-release.js';
import type { MigrationFile } from '../src/migration-tree.js';

function fixture() {
  return new Map<string, MigrationFile>(
    Object.entries({
      '.lvbt/tooling.json': JSON.stringify({
        release: { attestation: { signerCommit: 'a'.repeat(40) } },
      }),
      '.github/workflows/deploy.yml':
        'jobs:\n  build:\n    uses: release-publish.yml@sha\n    with:\n      app-directory: apps/deploy\n      attestation-prefix: proof\n',
      '.github/workflows/promote.yml':
        'jobs:\n  source:\n    uses: release-publish.yml@sha\n    with:\n      attestation-prefix: proof\n',
      'apps/example/package.json': JSON.stringify({ scripts: {} }),
    }).map(([name, content]) => [name, { mode: '100644', content: Buffer.from(content) }]),
  );
}

test('exported canonical Worker retains reviewed static settings and safely serializes their values', () => {
  const files = fixture();
  configureMigrationRelease(files, 'example', 'Example/standalone', {
    site: false,
    metadata: {
      name: 'lvbt-labs-example',
      compatibility_date: '2026-07-01',
      compatibility_flags: ['nodejs_compat', 'streams_enable_constructors'],
      preview_urls: false,
      assets: { directory: './dist', html_handling: 'none', not_found_handling: '404-page' },
      observability: { enabled: true, head_sampling_rate: 0.25 },
    },
  });
  const config = files.get('deploy/example/cloudflare.config.ts')?.content.toString();
  expect(config).toContain('compatibilityDate: "2026-07-01"');
  expect(config).toContain('streams_enable_constructors');
  expect(config).toContain('previewUrls: false');
  expect(config).toContain('"headSamplingRate":0.25');
  expect(config).toContain('"htmlHandling":"none"');
  expect(config).toContain('"notFoundHandling":"404-page"');
});

test('unsupported Worker resources fail before the export can silently drop them', () => {
  const files = fixture();
  expect(() =>
    configureMigrationRelease(files, 'example', 'Example/standalone', {
      site: false,
      metadata: { name: 'lvbt-labs-example', d1_databases: [{ binding: 'DB' }] },
    }),
  ).toThrow();
  expect(files.has('deploy/example/cloudflare.config.ts')).toBe(false);
});
