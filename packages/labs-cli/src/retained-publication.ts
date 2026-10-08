import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { z } from 'zod';
import { selectLabReleases } from './release-policy.js';

const inputSchema = z.strictObject({
  app: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u),
  runId: z.string().regex(/^[1-9][0-9]*$/u),
  expectedVersion: z.uuid().optional(),
  commit: z
    .string()
    .regex(/^[a-f0-9]{40}$/u)
    .optional(),
  reason: z.string().trim().min(1).max(120).optional(),
  apply: z.boolean(),
});
export interface RetainedPublicationResult {
  app: string;
  runId: string;
  ok: boolean;
  changed: boolean | null;
  errors: string[];
  journal?: string;
}
export type RetainedLabPublication = z.infer<typeof inputSchema>;
type Run = (args: string[], root: string) => Promise<string>;
const run: Run = async ([command, ...args], root) => {
  if (!command) throw new Error('Provide a release command.');
  return (
    await promisify(execFile)(command, args, {
      cwd: root,
      maxBuffer: 16 * 1024 * 1024,
    })
  ).stdout;
};
async function assertRetainedSource(root: string, input: RetainedLabPublication, command: Run) {
  if (!input.commit) return;
  const tooling = z
    .object({ release: z.object({ repository: z.literal('LasVegasForTransit/labs') }) })
    .parse(JSON.parse(await readFile(path.join(root, '.lvbt/tooling.json'), 'utf8')));
  const record = z
    .object({ head_sha: z.literal(input.commit) })
    .safeParse(
      JSON.parse(
        await command(
          ['gh', 'api', `repos/${tooling.release.repository}/actions/runs/${input.runId}`],
          root,
        ),
      ),
    );
  if (!record.success)
    throw new Error('The selected staging run does not match the requested retained source.');
}

/** Product ownership selection and incident journal; shared promotion owns every provider operation. */
export async function publishRetainedLab(
  root: string,
  raw: RetainedLabPublication,
  dependencies: { run?: Run; destinationOwner?: (repository: string) => Promise<string> } = {},
): Promise<RetainedPublicationResult> {
  const input = inputSchema.parse(raw);
  await selectLabReleases(
    root,
    {
      app: input.app,
      target: 'production',
      event: 'workflow_dispatch',
      retainedCommit: input.commit,
      runId: input.runId,
      expectedVersion: input.expectedVersion,
    },
    dependencies,
  );
  const result = { app: input.app, runId: input.runId };
  if (!input.apply) return { ...result, ok: true, changed: false, errors: [] };
  const command = dependencies.run ?? run;
  await assertRetainedSource(root, input, command);
  const directory = path.join(
    root,
    '.wrangler',
    'retained-publications',
    `${input.app}-${randomUUID()}`,
  );
  await mkdir(directory, { recursive: true });
  const journal = path.join(directory, 'journal.jsonl');
  const record = (phase: string, details: unknown) =>
    appendFile(journal, `${JSON.stringify({ phase, details })}\n`);
  await record('prepared', input);
  const args = ['pnpm', 'exec', 'lvbt', 'promote', '--app', input.app, '--run-id', input.runId];
  if (input.expectedVersion) args.push('--expected-version', input.expectedVersion);
  try {
    const output = await command(args, root);
    await record('verified', output);
    return { ...result, ok: true, changed: true, errors: [], journal };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await record('unconfirmed', message);
    return { ...result, ok: false, changed: null, errors: [message], journal };
  }
}
