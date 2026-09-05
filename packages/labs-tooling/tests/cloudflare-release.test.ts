import { expect, test } from 'vitest';
import { activeVersion, uploadedVersion } from '../src/cloudflare-release.js';

const first = '2ae50b24-3d42-48d2-a784-627b60841961';
const second = '1c4deaba-ee53-4c3f-ba65-176ae596cad5';
const deployment = (version: string, date: string) => ({
  created_on: date,
  versions: [{ version_id: version, percentage: 100 }],
});

test('selects the latest deployment independently of API ordering', () => {
  const records = [
    deployment(first, '2026-09-05T06:03:00Z'),
    deployment(second, '2026-09-05T06:04:00Z'),
  ];
  expect(activeVersion(records)).toBe(second);
  expect(activeVersion(records.reverse())).toBe(second);
});

test('does not flatten a traffic split into a misleading rollback version', () => {
  expect(() =>
    activeVersion([
      {
        created_on: '2026-09-05T06:04:00Z',
        versions: [
          { version_id: first, percentage: 50 },
          { version_id: second, percentage: 50 },
        ],
      },
    ]),
  ).toThrow(/traffic split/);
  expect(activeVersion([])).toBeNull();
  expect(() => activeVersion({ error: 'Unauthorized' })).toThrow();
});

test('compares deployment timestamps as instants rather than formatted strings', () => {
  expect(
    activeVersion([
      deployment(first, '2026-09-05T08:00:00+02:00'),
      deployment(second, '2026-09-05T07:00:00Z'),
    ]),
  ).toBe(second);
});

test('reads the version from structured Wrangler output, not console prose', () => {
  const record = { type: 'deploy', version: 1, worker_name: 'lvbt-labs-home', version_id: first };
  expect(
    uploadedVersion(
      `${JSON.stringify({ type: 'other' })}\n${JSON.stringify(record)}\n`,
      'lvbt-labs-home',
    ),
  ).toBe(first);
  expect(() => uploadedVersion(JSON.stringify(record), 'lvbt-labs-map')).toThrow();
  expect(() => uploadedVersion('Current Version ID: something', 'lvbt-labs-home')).toThrow();
});
