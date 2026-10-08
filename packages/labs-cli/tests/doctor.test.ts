import { expect, test } from 'vitest';
import { labsHealthConfiguration, doctorInput } from '../src/doctor.js';

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
  const base = {};
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

  expect(labsHealthConfiguration.parse({ ...base, externalWorkers }).externalWorkers).toEqual(
    externalWorkers,
  );
  expect(() =>
    labsHealthConfiguration.parse({
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

test('product health cannot introduce competing provider identity or secret declarations', () => {
  expect(() =>
    labsHealthConfiguration.parse({ accountId: 'a'.repeat(32), externalWorkers: [] }),
  ).toThrow();
  expect(() =>
    labsHealthConfiguration.parse({ secrets: ['CLOUDFLARE_API_TOKEN'], externalWorkers: [] }),
  ).toThrow();
});
