import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';

import { publishRetainedLab } from './retained-publication.js';
import { parseDeploymentArguments } from './deployment-cli.js';
import { deploymentPlan } from './deployment-plan.js';
import { assertDeploymentCheckout } from '@lasvegasfortransit/web-platform/release';

export { assertDeploymentCheckout } from '@lasvegasfortransit/web-platform/release';

export function parseApplyArguments(args: string[]) {
  const apply = args.includes('--apply');
  if (apply && args.includes('--dry-run'))
    throw new Error('--apply and --dry-run cannot be used together.');
  if (args.filter((argument) => argument === '--apply').length > 1)
    throw new Error('Provide --apply only once.');
  const { values } = parseArgs({
    args,
    options: {
      apply: { type: 'boolean' },
      'dry-run': { type: 'boolean' },
      all: { type: 'boolean' },
      json: { type: 'boolean' },
      base: { type: 'string' },
      head: { type: 'string' },
      'run-id': { type: 'string' },
    },
  });
  const filtered = args.filter(
    (argument, index) =>
      argument !== '--apply' && argument !== '--run-id' && args[index - 1] !== '--run-id',
  );
  return {
    apply,
    refs: parseDeploymentArguments(filtered),
    ...(values['run-id'] ? { runId: values['run-id'] } : {}),
  };
}

async function main(): Promise<void> {
  try {
    const root = process.cwd();
    const input = parseApplyArguments(process.argv.slice(2));
    const plan = deploymentPlan(root, input.refs);
    if (!input.apply) {
      process.stdout.write(`${JSON.stringify({ ok: true, changed: false, plan }, null, 2)}\n`);
      return;
    }
    if (!input.runId)
      throw new Error(
        'Select a retained staging run with --run-id before applying the deployment plan.',
      );
    assertDeploymentCheckout(root, plan.head);
    const results: Awaited<ReturnType<typeof publishRetainedLab>>[] = [];
    for (const app of [
      ...plan.deploy.filter((slug) => slug !== 'home'),
      ...plan.deploy.filter((slug) => slug === 'home'),
    ]) {
      if (app === 'home' && results.some((result) => !result.ok)) {
        results.push({
          app,
          runId: input.runId,
          ok: false,
          changed: false,
          errors: ['Home is withheld because a selected project failed retained promotion.'],
        });
        continue;
      }
      const result = await publishRetainedLab(root, {
        app,
        runId: input.runId,
        commit: plan.head,
        apply: true,
      });
      results.push(result);
    }
    const ok = results.every((result) => result.ok);
    process.stdout.write(`${JSON.stringify({ plan, ok, results }, null, 2)}\n`);
    if (!ok) process.exitCode = 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stdout.write(`${JSON.stringify({ ok: false, errors: [message] })}\n`);
    process.exitCode = 2;
  }
}

const entry = process.argv[1];
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) void main();
