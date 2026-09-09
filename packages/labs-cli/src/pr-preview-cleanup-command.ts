import { execFileSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import {
  activeVersion,
  cloudflareCredential,
  cloudflareReader,
  type CloudflareRead,
} from '@lvbt/web-platform/cloudflare';
import { cleanupPreviews } from './pr-preview-cleanup.js';

const slugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const inputSchema = z.object({
  pullRequest: z.number().int().positive(),
  repository: z.string().regex(/^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/),
  accountId: z.string().regex(/^[a-f0-9]+$/),
  zoneId: z.string().regex(/^[a-f0-9]+$/),
  apply: z.boolean(),
  json: z.boolean(),
});

export type PreviewCleanupInput = z.infer<typeof inputSchema>;

const workerNameSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const workersSchema = z.array(z.object({ id: workerNameSchema }));
const routesSchema = z.array(
  z.object({ pattern: z.string(), script: z.string().nullable().optional() }),
);
const previewMessageSchema = z
  .string()
  .regex(/^LVBT preview ([A-Za-z0-9-]+\/[A-Za-z0-9._-]+)#([1-9][0-9]*) [a-f0-9]{40}$/);

export function parsePreviewCleanupArguments(args: string[]) {
  const { values } = parseArgs({
    args,
    options: {
      'pull-request': { type: 'string' },
      repository: { type: 'string' },
      'account-id': { type: 'string' },
      'zone-id': { type: 'string' },
      apply: { type: 'boolean' },
      'dry-run': { type: 'boolean' },
      json: { type: 'boolean' },
    },
  });
  if (values.apply && values['dry-run'])
    throw new Error('--apply and --dry-run cannot be used together.');
  return inputSchema.parse({
    pullRequest: Number(values['pull-request']),
    repository: values.repository,
    accountId: values['account-id'],
    zoneId: values['zone-id'],
    apply: values.apply === true,
    json: values.json === true,
  });
}

export function temporaryPreviewSlugs(pullRequest: number, workers: string[]) {
  z.number().int().positive().parse(pullRequest);
  const prefix = `lvbt-labs-pr-${pullRequest}-`;
  return workers
    .filter((worker) => worker.startsWith(prefix))
    .map((worker) => slugSchema.parse(worker.slice(prefix.length)))
    .sort();
}

interface CleanupOperations {
  closed(): Promise<boolean>;
  read(worker: string): Promise<unknown>;
  remove(worker: string): Promise<void>;
}

interface ProviderDependencies {
  pullRequest(repository: string, pullRequest: number): Promise<unknown>;
  remove(endpoint: string): Promise<void>;
}

export function cloudflarePreviewCleanupOperations(
  input: Pick<PreviewCleanupInput, 'pullRequest' | 'repository' | 'accountId' | 'zoneId'>,
  read: CloudflareRead,
  dependencies: ProviderDependencies,
): CleanupOperations {
  const base = `accounts/${input.accountId}/workers/scripts`;
  const routesEndpoint = `zones/${input.zoneId}/workers/routes`;
  return {
    async closed() {
      return (
        z
          .object({ state: z.enum(['open', 'closed']) })
          .parse(await dependencies.pullRequest(input.repository, input.pullRequest)).state ===
        'closed'
      );
    },
    async read(worker) {
      workerNameSchema.parse(worker);
      const workers = workersSchema.parse(await read.list(base));
      if (!workers.some((candidate) => candidate.id === worker)) return null;
      const routes = routesSchema
        .parse(await read.list(routesEndpoint))
        .filter((route) => route.script === worker)
        .map((route) => route.pattern);
      const deployment = z
        .object({ deployments: z.unknown() })
        .parse(await read.get(`${base}/${worker}/deployments`));
      const version = activeVersion(deployment.deployments);
      if (version === null) throw new Error(`Preview Worker ${worker} has no active version.`);
      const message = z
        .object({
          annotations: z.object({ 'workers/message': previewMessageSchema }),
        })
        .parse(await read.get(`${base}/${worker}/versions/${version}`)).annotations[
        'workers/message'
      ];
      const match = /^LVBT preview (.+)#([0-9]+) /.exec(previewMessageSchema.parse(message));
      if (match?.[1] === undefined || match[2] === undefined)
        throw new Error('Preview ownership annotation is invalid.');
      return {
        repository: match[1],
        pullRequest: Number(match[2]),
        version,
        routes,
      };
    },
    remove(worker) {
      workerNameSchema.parse(worker);
      return dependencies.remove(`${base}/${worker}`);
    },
  };
}

interface RunDependencies {
  deployedWorkers(): Promise<string[]>;
  cleanup: typeof cleanupPreviews;
  operations: CleanupOperations;
}

export async function runPreviewCleanup(input: PreviewCleanupInput, dependencies: RunDependencies) {
  const slugs = temporaryPreviewSlugs(input.pullRequest, await dependencies.deployedWorkers());
  const result = await dependencies.cleanup(
    { repository: input.repository, pullRequest: input.pullRequest },
    slugs,
    dependencies.operations,
    input.apply,
  );
  return {
    command: 'preview-cleanup',
    ...result,
    mode: input.apply ? 'apply' : 'dry-run',
    slugs,
  };
}

function githubPullRequest(root: string, repository: string, pullRequest: number) {
  const output = execFileSync('gh', ['api', `repos/${repository}/pulls/${pullRequest}`], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 30000,
  });
  return Promise.resolve(JSON.parse(output) as unknown);
}

function cloudflareRemover(token: string) {
  return async (endpoint: string) => {
    const response = await fetch(`https://api.cloudflare.com/client/v4/${endpoint}`, {
      method: 'DELETE',
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Bearer ${token}` },
    });
    const result = z
      .object({ success: z.literal(true) })
      .safeParse(await response.json().catch(() => undefined));
    if (!response.ok || !result.success)
      throw new Error('Cloudflare preview removal was not confirmed. Re-read provider state.');
  };
}

async function main() {
  try {
    const root = process.cwd();
    const input = parsePreviewCleanupArguments(process.argv.slice(2));
    const token = cloudflareCredential(root);
    const read = cloudflareReader(token);
    const result = await runPreviewCleanup(input, {
      deployedWorkers: async () =>
        workersSchema
          .parse(await read.list(`accounts/${input.accountId}/workers/scripts`))
          .map((worker) => worker.id),
      cleanup: cleanupPreviews,
      operations: cloudflarePreviewCleanupOperations(input, read, {
        pullRequest: (repository, pullRequest) => githubPullRequest(root, repository, pullRequest),
        remove: cloudflareRemover(token),
      }),
    });
    process.stdout.write(`${JSON.stringify(result, null, input.json ? 0 : 2)}\n`);
    if (!result.ok) process.exitCode = 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stdout.write(
      `${JSON.stringify({ command: 'preview-cleanup', ok: false, errors: [message] })}\n`,
    );
    process.exitCode = 2;
  }
}

const entry = process.argv[1];
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) void main();
