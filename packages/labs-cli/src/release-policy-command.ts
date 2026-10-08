import { appendFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { selectLabReleases } from './release-policy.js';

const { values } = parseArgs({
  options: {
    app: { type: 'string' },
    target: { type: 'string' },
    event: { type: 'string' },
    commit: { type: 'string' },
    'run-id': { type: 'string' },
    'expected-version': { type: 'string' },
  },
});
if (values.target !== 'preview' && values.target !== 'production')
  throw new Error('Select preview or production.');
const apps = await selectLabReleases(process.cwd(), {
  app: values.app === '' ? undefined : values.app,
  target: values.target,
  event: values.event ?? '',
  commit: values.commit,
  runId: values['run-id'],
  expectedVersion: values['expected-version'],
});
if (process.env.GITHUB_OUTPUT)
  await appendFile(process.env.GITHUB_OUTPUT, `matrix=${JSON.stringify(apps)}\n`);
process.stdout.write(`${JSON.stringify({ apps }, null, 2)}\n`);
