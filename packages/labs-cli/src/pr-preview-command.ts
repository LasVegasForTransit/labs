import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import { cloudflareCredential, cloudflareReader } from '@lvbt/web-platform/cloudflare';
import { deploymentPlan } from './deployment-plan.js';
import { publishPullRequestPreviews } from './pr-preview-deployment.js';
import { previewTargets, type PreviewTarget } from './pr-preview-plan.js';

const inputSchema = z.object({
  pullRequest: z.number().int().positive(),
  repository: z.string().regex(/^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/),
  base: z.string().min(1),
  head: z.string().min(1),
  accountId: z.string().regex(/^[a-f0-9]+$/),
  apply: z.boolean(),
  json: z.boolean(),
});

export type PreviewCommandInput = z.infer<typeof inputSchema>;

export function parsePreviewArguments(args: string[]): PreviewCommandInput {
  const { values } = parseArgs({
    args,
    options: {
      'pull-request': { type: 'string' },
      repository: { type: 'string' },
      base: { type: 'string' },
      head: { type: 'string' },
      'account-id': { type: 'string' },
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
    base: values.base,
    head: values.head,
    accountId: values['account-id'],
    apply: values.apply === true,
    json: values.json === true,
  });
}

interface PreviewPlan {
  head: string;
  packages: string[];
  deploy: string[];
}

interface PreviewResult {
  ok: boolean;
  results: Array<{
    target: PreviewTarget;
    status: 'verified' | 'failed' | 'withheld';
    receipt?: { version: string; url: string };
    phase?: string;
  }>;
  phase?: string;
}

interface PreviewPlanDependencies {
  deploymentPlan?: (root: string, refs: { base?: string; head?: string }) => PreviewPlan;
  deployedWorkers(): Promise<string[]>;
}

interface PreviewRunDependencies extends PreviewPlanDependencies {
  publish(
    plan: PreviewPlan,
    targets: PreviewTarget[],
    input: PreviewCommandInput,
  ): Promise<PreviewResult>;
}

export async function planPullRequestPreview(
  root: string,
  input: PreviewCommandInput,
  dependencies: PreviewPlanDependencies,
) {
  const plan = (dependencies.deploymentPlan ?? deploymentPlan)(root, {
    base: input.base,
    head: input.head,
  });
  const targets = previewTargets(
    input.pullRequest,
    plan.deploy,
    await dependencies.deployedWorkers(),
  );
  return { plan, targets };
}

export async function runPullRequestPreview(
  root: string,
  input: PreviewCommandInput,
  dependencies: PreviewRunDependencies,
) {
  const preview = await planPullRequestPreview(root, input, dependencies);
  if (!input.apply)
    return {
      command: 'preview',
      ok: true,
      changed: false,
      mode: 'dry-run',
      ...preview,
    };
  const result = await dependencies.publish(preview.plan, preview.targets, input);
  return {
    command: 'preview',
    ...result,
    changed: result.results.some((item) => item.status === 'verified'),
    mode: 'apply',
    plan: preview.plan,
  };
}

async function main() {
  try {
    const root = process.cwd();
    const input = parsePreviewArguments(process.argv.slice(2));
    const read = cloudflareReader(cloudflareCredential(root));
    const result = await runPullRequestPreview(root, input, {
      deployedWorkers: async () =>
        z
          .array(z.object({ id: z.string() }))
          .parse(await read.list(`accounts/${input.accountId}/workers/scripts`))
          .map((worker) => worker.id),
      publish: (plan, targets) =>
        publishPullRequestPreviews({
          root,
          identity: {
            repository: input.repository,
            pullRequest: input.pullRequest,
            commit: plan.head,
            accountId: input.accountId,
          },
          plan,
          targets,
          read,
        }),
    });
    process.stdout.write(`${JSON.stringify(result, null, input.json ? 0 : 2)}\n`);
    if (!result.ok) process.exitCode = 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stdout.write(
      `${JSON.stringify({ command: 'preview', ok: false, errors: [message] })}\n`,
    );
    process.exitCode = 2;
  }
}

const entry = process.argv[1];
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) void main();
