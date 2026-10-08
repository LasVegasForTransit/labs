import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import {
  authenticatedCloudflareReader,
  cloudflareReader,
  validAnalytics,
} from '@lasvegasfortransit/web-platform/cloudflare';
import { discoverLabs, discoverSourceLabs } from './discovery.js';
import { liveDoctor, type LiveCheck } from './live-doctor.js';
import { runStandardPlatform } from './standard-platform.js';
import { platformIdentity } from './platform-identity.js';

export const labsHealthConfiguration = z.strictObject({
  externalWorkers: z
    .array(
      z
        .object({
          slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
          name: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
          previewRequired: z.boolean(),
          externalProbe: z.object({
            path: z.string().startsWith('/'),
            status: z.number().int().min(100).max(599),
            contentType: z.string().min(1),
          }),
        })
        .refine(
          (worker) =>
            worker.slug !== 'home' && worker.externalProbe.path.startsWith(`/${worker.slug}/`),
          'External Worker probes must stay under their declared project route.',
        ),
    )
    .default([]),
});

export function doctorInput(args: string[]) {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      slug: { type: 'string' },
      json: { type: 'boolean' },
      'dry-run': { type: 'boolean' },
    },
  });
  if (positionals.length > 1 || (values.slug !== undefined && positionals.length > 0))
    throw new Error('Provide at most one lab slug. Doctor is read-only.');
  return { slug: values.slug ?? positionals[0], json: values.json === true };
}

export async function doctor(root: string, args: string[]) {
  const input = doctorInput(args);
  const target = await platformIdentity(root);
  const module: unknown = await import(
    pathToFileURL(path.join(root, '.lvbt/labs-health.config.ts')).href
  );
  const health = labsHealthConfiguration.parse(
    z.object({ default: z.unknown() }).parse(module).default,
  );
  const labs = await discoverLabs(root);
  const sourceLabs = await discoverSourceLabs(root);
  if (health.externalWorkers.some((worker) => sourceLabs.some((lab) => lab.slug === worker.slug)))
    throw new Error('An external Worker cannot share a slug with a Labs app.');
  if (
    input.slug !== undefined &&
    !labs.some((lab) => lab.slug === input.slug) &&
    !health.externalWorkers.some((worker) => worker.slug === input.slug)
  )
    throw new Error(`Unknown lab: ${input.slug}`);
  const workers = sourceLabs
    .filter((lab) => lab.status !== 'draft')
    .map((lab) => ({ slug: lab.slug, name: `lvbt-labs-${lab.slug}` }))
    .concat(health.externalWorkers);
  const platform = await runStandardPlatform(root, false);
  const analytics: LiveCheck = {
    id: 'cloudflare.analytics',
    requirement: 'One Web Analytics property includes the Labs hostname.',
    status: 'unknown',
  };
  try {
    const token = process.env.CLOUDFLARE_ANALYTICS_READ_TOKEN?.trim();
    const reader = token ? cloudflareReader(token) : authenticatedCloudflareReader(root);
    analytics.status = validAnalytics(
      await reader.list(`accounts/${target.accountId}/rum/site_info/list`),
      target.hostname,
    )
      ? 'pass'
      : 'fail';
  } catch {
    analytics.status = 'unknown';
  }
  const checks = [...(await liveDoctor(target.hostname, workers)), analytics];
  return {
    command: 'doctor',
    scope: 'platform-readiness-and-product-health',
    ok: platform.ok && checks.every((check) => check.status === 'pass'),
    changed: false,
    platform,
    target,
    requestedLab: input.slug ?? null,
    checks,
    excludedDrafts: labs.filter((lab) => lab.status === 'draft').map((lab) => lab.slug),
    verificationRequired: [
      'Protected staging Access policy',
      'Preview analytics exclusion',
      'Production rollback',
    ],
  };
}
