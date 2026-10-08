import { rollbackInput } from './rollback-input.js';
import { publishRetainedLab } from './retained-publication.js';

export async function rollbackLab(root: string, args: string[]) {
  const { slug, ...input } = await rollbackInput(args);
  return {
    command: 'rollback',
    slug,
    ...(await publishRetainedLab(root, { app: slug, ...input })),
  };
}
