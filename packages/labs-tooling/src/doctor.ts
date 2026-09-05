import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { authenticatedCloudflareReader } from './cloudflare-read.js';
import { githubReader } from './github-read.js';
import { githubDoctor } from './doctor-github.js';
import { cloudflareDoctor } from './doctor-cloudflare.js';
import { discoverLabs } from './discovery.js';

const hostname = z.string().regex(/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/);
const infrastructure = z.object({
  repository: z.string().regex(/^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/),
  branch: z.string().min(1),
  environment: z.string().min(1),
  accountId: z.string().regex(/^[a-f0-9]+$/),
  zoneId: z.string().regex(/^[a-f0-9]+$/),
  zoneName: hostname,
  hostname,
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
  const target = infrastructure.parse(module.default);
  if (target.hostname !== target.zoneName && !target.hostname.endsWith(`.${target.zoneName}`))
    throw new Error('The hostname must belong to the declared zone.');
  const labs = await discoverLabs(root);
  if (input.slug !== undefined && !labs.some((lab) => lab.slug === input.slug))
    throw new Error(`Unknown lab: ${input.slug}`);
  const workers = labs
    .filter((lab) => lab.status !== 'draft')
    .map((lab) => ({ slug: lab.slug, name: `lvbt-labs-${lab.slug}` }));
  const ruleset: unknown = JSON.parse(
    await readFile(path.join(root, '.lvbt/web-platform/standards/ruleset.json'), 'utf8'),
  );
  const github = await githubDoctor({ ...target, ruleset }, githubReader(root));
  let cloudflare;
  try {
    cloudflare = authenticatedCloudflareReader(root);
  } catch {
    const unavailable = () => Promise.reject(new Error('Cloudflare authentication unavailable.'));
    cloudflare = { get: unavailable, list: unavailable };
  }
  const checks = [...github, ...(await cloudflareDoctor({ ...target, workers }, cloudflare))];
  return {
    command: 'doctor',
    scope: 'infrastructure-configuration',
    ok: checks.every((check) => check.status === 'pass'),
    changed: false,
    target,
    requestedLab: input.slug ?? null,
    checks,
    excludedDrafts: labs.filter((lab) => lab.status === 'draft').map((lab) => lab.slug),
    verificationRequired: [
      'Live DNS and TLS',
      'Worker versions and response headers',
      'Preview analytics exclusion',
      'Production rollback',
    ],
  };
}
