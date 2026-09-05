import { discoverLabs } from './manifest.js';
import { rollbackInput } from './rollback-input.js';
import { rollbackCloudflare } from './rollback-cloudflare.js';
import { rollbackWorker } from './rollback.js';

export async function rollbackLab(root: string, args: string[]) {
  const input = await rollbackInput(args);
  const manifest = (await discoverLabs(root)).find((lab) => lab.slug === input.slug);
  if (manifest === undefined) throw new Error(`No lab exists with slug ${input.slug}.`);
  return rollbackWorker(input, rollbackCloudflare(root, manifest));
}
