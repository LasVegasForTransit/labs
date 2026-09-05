import { z } from 'zod';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const historySchema = z.object({
  workflow_runs: z.array(
    z.object({
      id: z.number().int().positive(),
      status: z.string(),
      conclusion: z.string().nullable(),
      head_sha: z.string().regex(/^[a-f0-9]{40}$/),
    }),
  ),
});

export function deploymentBaseline(history: unknown, current: { id: number; attempt: number }) {
  const runs = historySchema.parse(history).workflow_runs;
  if (current.attempt !== 1) return null;
  const previous = runs.filter((run) => run.id !== current.id).sort((a, b) => b.id - a.id)[0];
  if (
    previous === undefined ||
    previous.id > current.id ||
    previous.status !== 'completed' ||
    previous.conclusion !== 'success'
  )
    return null;
  return previous.head_sha;
}

const entry = process.argv[1];
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) {
  try {
    const current = z
      .object({
        id: z.coerce.number().int().positive(),
        attempt: z.coerce.number().int().positive(),
      })
      .parse({
        id: process.env.GITHUB_RUN_ID,
        attempt: process.env.GITHUB_RUN_ATTEMPT,
      });
    const base = deploymentBaseline(JSON.parse(readFileSync(0, 'utf8')), current);
    if (base !== null) process.stdout.write(`${base}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  }
}
