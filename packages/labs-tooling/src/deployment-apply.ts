import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';

import { cloudflareDeployment } from './cloudflare-deployment.js';
import { parseDeploymentArguments } from './deployment-cli.js';
import { deploymentPlan } from './deployment-plan.js';
import { deployProjects } from './deployment.js';
import { assertDeploymentCheckout } from './deployment-checkout.js';

export { assertDeploymentCheckout } from './deployment-checkout.js';

export function parseApplyArguments(args: string[]) {
  const apply = args.includes('--apply');
  if (apply && args.includes('--dry-run'))
    throw new Error('--apply and --dry-run cannot be used together.');
  if (args.filter((argument) => argument === '--apply').length > 1)
    throw new Error('Provide --apply only once.');
  return {
    apply,
    refs: parseDeploymentArguments(args.filter((argument) => argument !== '--apply')),
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
    assertDeploymentCheckout(root, plan.head);
    const checks = await promisify(execFile)('pnpm', ['check'], {
      cwd: root,
      maxBuffer: 16 * 1024 * 1024,
    });
    process.stderr.write(checks.stdout);
    process.stderr.write(checks.stderr);
    assertDeploymentCheckout(root, plan.head);
    const result = await deployProjects(plan, cloudflareDeployment(root, plan.head, plan.deploy));
    process.stdout.write(`${JSON.stringify({ plan, ...result }, null, 2)}\n`);
    if (!result.ok) process.exitCode = 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stdout.write(`${JSON.stringify({ ok: false, errors: [message] })}\n`);
    process.exitCode = 2;
  }
}

const entry = process.argv[1];
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) void main();
