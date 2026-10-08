import { parseArgs } from 'node:util';
import { runStandardPlatform } from './standard-platform.js';

export function provisionInput(args: string[]) {
  const { values } = parseArgs({
    args,
    options: {
      apply: { type: 'boolean' },
      'dry-run': { type: 'boolean' },
      json: { type: 'boolean' },
    },
  });
  if (values.apply && values['dry-run']) throw new Error('Choose --apply or --dry-run, not both.');
  return { apply: values.apply === true, json: values.json === true };
}

/** Compatibility route into the standard; never creates a repository or deploys application code. */
export async function provision(root: string, args: string[]) {
  const input = provisionInput(args);
  return {
    ...(await runStandardPlatform(root, input.apply)),
    mode: input.apply ? 'apply' : 'dry-run',
  };
}
