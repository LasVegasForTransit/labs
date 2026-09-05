import { z } from 'zod';
import { previewTargets } from './pr-preview-plan.js';
import { reconcileResources } from './provision-reconcile.js';

const identitySchema = z.object({
  repository: z.string().regex(/^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/),
  pullRequest: z.number().int().positive(),
});
const workerSchema = identitySchema.extend({
  version: z.string().min(1),
  routes: z.array(z.string()).max(0),
});

interface Operations {
  closed(): Promise<boolean>;
  read(worker: string): Promise<unknown>;
  remove(worker: string): Promise<void>;
}

export async function cleanupPreviews(
  identity: z.input<typeof identitySchema>,
  slugs: string[],
  operations: Operations,
  apply: boolean,
) {
  const owner = identitySchema.parse(identity);
  const targets = previewTargets(owner.pullRequest, slugs, []);
  return reconcileResources(
    targets.map((target) => ({
      id: `preview.cleanup.${target.worker}`,
      read: async () => {
        if (!(await operations.closed())) throw new Error('The pull request is not closed.');
        const input = await operations.read(target.worker);
        if (input === null) return null;
        const worker = workerSchema.parse(input);
        if (worker.repository !== owner.repository || worker.pullRequest !== owner.pullRequest)
          throw new Error('Worker ownership does not match the closed pull request.');
        return worker;
      },
      desired: () => null,
      write: () => operations.remove(target.worker),
    })),
    apply,
  );
}
