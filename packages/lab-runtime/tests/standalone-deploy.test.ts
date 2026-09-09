import { expect, test } from 'vitest';
import {
  deployStandalone,
  standaloneDeploymentInput,
  type StandaloneDeploymentOperations,
} from '../src/standalone-deploy.js';

const commit = 'a'.repeat(40);
const marker = {
  formatVersion: 1 as const,
  slug: 'example',
  commit,
  artifactHash: 'b'.repeat(64),
};

function operations(events: string[]): StandaloneDeploymentOperations {
  return {
    build: () => {
      events.push('build');
      return Promise.resolve();
    },
    guard: () => {
      events.push('guard');
    },
    seal: () => {
      events.push('seal');
      return Promise.resolve(marker);
    },
    activeVersion: () => {
      events.push('active');
      return Promise.resolve('11111111-1111-4111-8111-111111111111');
    },
    upload: (_marker, dryRun) => {
      events.push(`upload:${dryRun}`);
      return Promise.resolve(dryRun ? null : '22222222-2222-4222-8222-222222222222');
    },
    verify: () => {
      events.push('verify');
      return Promise.resolve();
    },
    journal: (phase) => {
      events.push(`journal:${phase}`);
      return Promise.resolve();
    },
  };
}

test('seals, uploads, and verifies a standalone release with rollback state', async () => {
  const events: string[] = [];
  await expect(
    deployStandalone({ slug: 'example', commit, dryRun: false }, operations(events)),
  ).resolves.toMatchObject({
    ok: true,
    changed: true,
    version: '22222222-2222-4222-8222-222222222222',
    previousVersion: '11111111-1111-4111-8111-111111111111',
    marker,
  });
  expect(events).toEqual([
    'build',
    'guard',
    'seal',
    'guard',
    'active',
    'journal:prepared',
    'upload:false',
    'journal:uploaded',
    'verify',
    'journal:verified',
  ]);
});

test('dry run builds and exercises Wrangler without claiming a deployment', async () => {
  const events: string[] = [];
  await expect(
    deployStandalone({ slug: 'example', commit, dryRun: true }, operations(events)),
  ).resolves.toMatchObject({ ok: true, changed: false, version: null, marker });
  expect(events).toEqual(['build', 'guard', 'seal', 'guard', 'upload:true']);
});

test('an upload failure leaves an unconfirmed journal entry', async () => {
  const events: string[] = [];
  const failing = operations(events);
  failing.upload = () => Promise.reject(new Error('upload failed'));
  await expect(
    deployStandalone({ slug: 'example', commit, dryRun: false }, failing),
  ).rejects.toThrow(/could not be confirmed/);
  expect(events.at(-1)).toBe('journal:upload-unconfirmed');
});

test('standalone deployment input accepts one slug and an optional dry run', () => {
  expect(standaloneDeploymentInput(['example'])).toEqual({ slug: 'example', dryRun: false });
  expect(standaloneDeploymentInput(['example', '--dry-run'])).toEqual({
    slug: 'example',
    dryRun: true,
  });
  expect(() => standaloneDeploymentInput([])).toThrow(/slug/);
  expect(() => standaloneDeploymentInput(['example', '--unknown'])).toThrow(/option/);
});
