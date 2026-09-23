import { expect, test } from 'vitest';
import { doctorInfrastructure, doctorInput } from '../src/doctor.js';

test('doctor accepts repository and project configuration audits', () => {
  expect(doctorInput(['--json', '--dry-run'])).toEqual({ slug: undefined, json: true });
  expect(doctorInput(['home'])).toEqual({ slug: 'home', json: false });
});

test('doctor rejects mutations, extra projects, and ambiguous selection', () => {
  expect(() => doctorInput(['--apply'])).toThrow();
  expect(() => doctorInput(['home', 'map'])).toThrow();
  expect(() => doctorInput(['home', '--slug', 'map'])).toThrow();
});

test('doctor accepts an independently owned Worker only with a scoped live probe', () => {
  const base = {
    repository: 'LasVegasForTransit/labs',
    branch: 'main',
    environment: 'production',
    preview: {
      environment: 'preview',
      secret: 'CLOUDFLARE_PREVIEW_API_TOKEN',
      enabledVariable: 'CLOUDFLARE_PREVIEWS_ENABLED',
    },
    accountId: 'abc123',
    zoneId: 'abc123',
    zoneName: 'example.org',
    hostname: 'labs.example.org',
  };
  const externalWorker = {
    slug: 'transit-mapper',
    name: 'transitmapper',
    previewRequired: false,
    externalProbe: {
      path: '/transit-mapper/api/systems/missing',
      status: 404,
      contentType: 'application/json',
    },
  };
  const externalWorkers = [externalWorker];

  expect(doctorInfrastructure.parse({ ...base, externalWorkers }).externalWorkers).toEqual(
    externalWorkers,
  );
  expect(() =>
    doctorInfrastructure.parse({
      ...base,
      externalWorkers: [
        {
          ...externalWorker,
          externalProbe: { ...externalWorker.externalProbe, path: '/other/api' },
        },
      ],
    }),
  ).toThrow();
});
