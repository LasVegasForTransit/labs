import { createInterface } from 'node:readline/promises';
import { parseArgs } from 'node:util';
import { rollbackSchema } from './rollback.js';

export async function rollbackInput(args: string[]) {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      slug: { type: 'string' },
      version: { type: 'string' },
      'expected-version': { type: 'string' },
      commit: { type: 'string' },
      reason: { type: 'string' },
      apply: { type: 'boolean' },
      'dry-run': { type: 'boolean' },
      json: { type: 'boolean' },
    },
  });
  if (values.apply && values['dry-run'])
    throw new Error('--apply and --dry-run cannot be used together.');
  if (positionals.length > 1 || (positionals.length > 0 && values.slug !== undefined))
    throw new Error('Provide one lab slug.');
  const input = {
    slug: values.slug ?? positionals[0],
    version: values.version,
    expectedVersion: values['expected-version'],
    commit: values.commit,
    reason: values.reason,
    apply: values.apply === true,
  };
  if (process.stdin.isTTY && !values.json) {
    const prompt = createInterface({ input: process.stdin, output: process.stderr });
    try {
      input.slug ??= await prompt.question('Lab slug: ');
      input.version ??= await prompt.question('Version to restore: ');
      input.expectedVersion ??= await prompt.question('Expected current version: ');
      input.commit ??= await prompt.question('Full source commit of the version to restore: ');
      input.reason ??= await prompt.question('Reason for rollback: ');
    } finally {
      prompt.close();
    }
  }
  return rollbackSchema.parse(input);
}
