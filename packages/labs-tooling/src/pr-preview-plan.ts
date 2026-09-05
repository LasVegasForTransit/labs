import { z } from 'zod';

const slugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export function previewTargets(
  pullRequest: number,
  slugs: string[],
  deployedWorkers: string[],
  statefulSlugs: string[] = [],
) {
  z.number().int().positive().parse(pullRequest);
  z.array(slugSchema).parse(slugs);
  if (new Set(slugs).size !== slugs.length)
    throw new Error('Preview project slugs must be unique.');
  return slugs.map((slug) => {
    const production = `lvbt-labs-${slug}`;
    const mode = statefulSlugs.includes(slug)
      ? 'staging'
      : deployedWorkers.includes(production)
        ? 'version'
        : 'temporary';
    const worker =
      mode === 'version'
        ? production
        : mode === 'staging'
          ? `lvbt-labs-staging-${slug}`
          : `lvbt-labs-pr-${pullRequest}-${slug}`;
    if (worker.length > 63) throw new Error(`Preview Worker name is too long for ${slug}.`);
    if (mode !== 'version' && slugs.some((candidate) => `lvbt-labs-${candidate}` === worker))
      throw new Error(`Preview Worker name collides with a production project: ${worker}.`);
    return { slug, worker, mode, cleanup: mode === 'temporary' };
  });
}
