import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import {
  authenticatedCloudflareReader,
  cloudflareDoctor,
  cloudflareReader,
} from '@lasvegasfortransit/web-platform/cloudflare';
import { githubDoctor, githubReader } from '@lasvegasfortransit/web-platform/github';
import { discoverLabs, discoverSourceLabs } from './discovery.js';
import { githubPreviewReader, optionalGitHubRead } from './github-preview-read.js';
import { liveDoctor } from './live-doctor.js';

const hostname = z.string().regex(/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/);
export const doctorInfrastructure = z.object({
  repository: z.string().regex(/^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/),
  branch: z.string().min(1),
  environment: z.string().min(1),
  preview: z.object({
    environment: z.string().regex(/^[A-Za-z0-9._-]+$/),
    secret: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
    enabledVariable: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
  }),
  accountId: z.string().regex(/^[a-f0-9]+$/),
  zoneId: z.string().regex(/^[a-f0-9]+$/),
  zoneName: hostname,
  hostname,
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
  const module = (await import(
    pathToFileURL(path.join(root, '.lvbt/infrastructure.config.ts')).href
  )) as { default: unknown };
  const target = doctorInfrastructure.parse(module.default);
  if (target.hostname !== target.zoneName && !target.hostname.endsWith(`.${target.zoneName}`))
    throw new Error('The hostname must belong to the declared zone.');
  const labs = await discoverLabs(root);
  const sourceLabs = await discoverSourceLabs(root);
  if (target.externalWorkers.some((worker) => sourceLabs.some((lab) => lab.slug === worker.slug)))
    throw new Error('An external Worker cannot share a slug with a Labs app.');
  if (
    input.slug !== undefined &&
    !labs.some((lab) => lab.slug === input.slug) &&
    !target.externalWorkers.some((worker) => worker.slug === input.slug)
  )
    throw new Error(`Unknown lab: ${input.slug}`);
  const workers = sourceLabs
    .filter((lab) => lab.status !== 'draft')
    .map((lab) => ({ slug: lab.slug, name: `lvbt-labs-${lab.slug}` }))
    .concat(target.externalWorkers);
  const ruleset: unknown = JSON.parse(
    await readFile(path.join(root, '.lvbt/web-platform/standards/ruleset.json'), 'utf8'),
  );
  const previewEnvironment = `repos/${target.repository}/environments/${encodeURIComponent(target.preview.environment)}`;
  const github = await githubDoctor(
    { ...target, ruleset },
    githubPreviewReader(previewEnvironment, githubReader(root), (endpoint) =>
      optionalGitHubRead(root, endpoint),
    ),
  );
  let cloudflare;
  try {
    cloudflare = authenticatedCloudflareReader(root);
  } catch {
    const unavailable = () => Promise.reject(new Error('Cloudflare authentication unavailable.'));
    cloudflare = { get: unavailable, list: unavailable };
  }
  const analyticsReadToken = process.env.CLOUDFLARE_ANALYTICS_READ_TOKEN?.trim();
  const analyticsReader = analyticsReadToken ? cloudflareReader(analyticsReadToken) : cloudflare;
  const analyticsEndpoint = `accounts/${target.accountId}/rum/site_info/list`;
  const cloudflareChecks = {
    get: (endpoint: string) => cloudflare.get(endpoint),
    list: (endpoint: string) =>
      endpoint === analyticsEndpoint ? analyticsReader.list(endpoint) : cloudflare.list(endpoint),
  };
  const checks = [
    ...github,
    ...(await cloudflareDoctor({ ...target, workers }, cloudflareChecks)),
    ...(await liveDoctor(target.hostname, workers)),
  ];
  return {
    command: 'doctor',
    scope: 'infrastructure-configuration',
    ok: checks.every((check) => check.status === 'pass'),
    changed: false,
    target,
    requestedLab: input.slug ?? null,
    checks,
    excludedDrafts: labs.filter((lab) => lab.status === 'draft').map((lab) => lab.slug),
    verificationRequired: ['Preview analytics exclusion', 'Production rollback'],
  };
}
