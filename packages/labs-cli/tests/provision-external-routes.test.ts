import { expect, test } from 'vitest';
import { managedRouteInventory } from '../src/provision-providers.js';

const externalWorkers = [{ slug: 'transit-mapper', name: 'transitmapper' }];

test('excludes matching externally owned routes from Labs provisioning', () => {
  const routes = [
    { pattern: 'labs.example.org/*', script: 'lvbt-labs-home' },
    { pattern: 'labs.example.org/transit-mapper', script: 'transitmapper' },
    { pattern: 'labs.example.org/transit-mapper/*', script: 'transitmapper' },
  ];

  expect(managedRouteInventory(routes, 'labs.example.org', externalWorkers)).toEqual([routes[0]]);
});

test('keeps a conflicting external route visible to the shared reconciler', () => {
  const routes = [{ pattern: 'labs.example.org/transit-mapper', script: 'wrong-worker' }];

  expect(managedRouteInventory(routes, 'labs.example.org', externalWorkers)).toEqual(routes);
});
