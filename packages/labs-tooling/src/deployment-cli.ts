import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';

import { deploymentPlan } from './deployment-plan.js';

export function parseDeploymentArguments(args: string[]): { base?: string; head?: string } {
  const { values } = parseArgs({
    args,
    options: {
      base: { type: 'string' },
      head: { type: 'string' },
      all: { type: 'boolean' },
      'dry-run': { type: 'boolean' },
      json: { type: 'boolean' },
    },
  });
  if ((values.base !== undefined) === (values.all === true)) {
    throw new Error('Provide --base <commit> or --all, but not both.');
  }
  return {
    ...(values.base === undefined ? {} : { base: values.base }),
    ...(values.head === undefined ? {} : { head: values.head }),
  };
}

function main(): void {
  try {
    const refs = parseDeploymentArguments(process.argv.slice(2));
    const plan = deploymentPlan(process.cwd(), refs);
    process.stdout.write(`${JSON.stringify({ ok: true, changed: false, ...plan }, null, 2)}\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stdout.write(`${JSON.stringify({ ok: false, changed: false, errors: [message] })}\n`);
    process.exitCode = 2;
  }
}

const entry = process.argv[1];
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) main();
