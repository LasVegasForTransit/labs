import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { promisify } from 'node:util';
import { z } from 'zod';
import { archiveRoutes } from './archive-browser.js';
import { archiveChecksums } from './archive-files.js';
import { verifyStoredArchive } from './archive-store.js';
import { activeVersion, verifyArchiveVersion } from './cloudflare-release.js';
import { verifyReleaseResponse } from './release-artifact.js';

const deploymentSchema = z
  .object({
    slug: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .refine((slug) => slug !== 'home'),
    commit: z.string().regex(/^[a-f0-9]{40}$/),
    version: z.uuid(),
    previousVersion: z.uuid(),
  })
  .strict()
  .refine(
    (input) => input.version !== input.previousVersion,
    'Record a distinct rollback version.',
  );

type RetirementDeployment = z.infer<typeof deploymentSchema>;
type Run = (args: string[]) => Promise<string>;

function providerReader(root: string, slug: string): Run {
  return async (args) =>
    (
      await promisify(execFile)(
        'pnpm',
        ['exec', 'wrangler', ...args, '--name', `lvbt-labs-${slug}`],
        {
          cwd: root,
          env: { ...process.env, WRANGLER_LOG_SANITIZE: 'true' },
          timeout: 120000,
          maxBuffer: 16 * 1024 * 1024,
        },
      )
    ).stdout;
}

async function verifyPublicFiles(
  request: typeof fetch,
  slug: string,
  commit: string,
  site: ReadonlyMap<string, Buffer>,
) {
  for (const [pathname, asset] of archiveRoutes(slug, site)) {
    const response = await request(
      `https://labs.lasvegasfortransit.org${pathname}?commit=${commit}`,
      {
        redirect: 'manual',
        cache: 'no-store',
        signal: AbortSignal.timeout(15000),
      },
    );
    if (response.status !== 200 || !Buffer.from(await response.arrayBuffer()).equals(asset.body))
      throw new Error(`The public archive file does not match its snapshot: ${pathname}`);
  }
}

export async function verifyRetirementDeployment(
  root: string,
  raw: RetirementDeployment,
  dependencies: { run?: Run; fetch?: typeof fetch } = {},
) {
  const input = deploymentSchema.parse(raw);
  const archive = await verifyStoredArchive(path.join(root, 'retired', input.slug));
  const marker = {
    formatVersion: 1 as const,
    slug: input.slug,
    commit: input.commit,
    artifactHash: createHash('sha256').update(archiveChecksums(archive.site)).digest('hex'),
  };
  const run = dependencies.run ?? providerReader(root, input.slug);
  const request = dependencies.fetch ?? fetch;
  const current = async () =>
    activeVersion(JSON.parse(await run(['deployments', 'list', '--json'])));
  if ((await current()) !== input.version) throw new Error('The retirement version is not active.');
  const version: unknown = JSON.parse(await run(['versions', 'view', input.version, '--json']));
  verifyArchiveVersion(version, input.version);
  z.object({
    annotations: z.object({
      'workers/message': z.literal(`Archive ${input.commit} ${marker.artifactHash}`),
    }),
  }).parse(version);
  z.object({ id: z.literal(input.previousVersion) }).parse(
    JSON.parse(await run(['versions', 'view', input.previousVersion, '--json'])),
  );
  const response = await request(
    `https://labs.lasvegasfortransit.org/${input.slug}/lvbt-release.json?commit=${input.commit}`,
    { redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(15000) },
  );
  await verifyReleaseResponse(response, marker);
  await verifyPublicFiles(request, input.slug, input.commit, archive.site);
  if ((await current()) !== input.version)
    throw new Error('The active version changed during retirement verification.');
  return {
    ...marker,
    version: input.version,
    previousVersion: input.previousVersion,
    verified: true as const,
  };
}
