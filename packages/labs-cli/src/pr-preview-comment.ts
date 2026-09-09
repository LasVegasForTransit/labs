import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';

const targetSchema = z.object({
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  worker: z.string(),
  mode: z.enum(['version', 'temporary', 'staging']),
  cleanup: z.boolean(),
});
const resultSchema = z.object({
  command: z.literal('preview'),
  ok: z.boolean(),
  phase: z.string().optional(),
  errors: z.array(z.string()).default([]),
  results: z
    .array(
      z.object({
        target: targetSchema,
        status: z.enum(['verified', 'failed', 'withheld']),
        receipt: z.object({ version: z.string().min(1), url: z.url() }).optional(),
        phase: z.string().optional(),
      }),
    )
    .default([]),
});

export function formatPreviewComment(input: unknown) {
  const result = resultSchema.parse(input);
  const lines = result.results.map((item) => {
    if (item.status !== 'verified' || item.receipt === undefined)
      return `- \`${item.target.slug}\`: ${item.status} during \`${item.phase ?? result.phase ?? 'preview'}\``;
    const url = new URL(item.receipt.url);
    url.pathname = item.target.slug === 'home' ? '/' : `/${item.target.slug}/`;
    const label = item.target.slug === 'home' ? 'Labs home' : item.target.slug;
    const temporary = item.target.mode === 'temporary' ? ' (temporary Worker)' : '';
    return `- [${label}](${url.href}) at \`${item.receipt.version}\`${temporary}`;
  });
  if (lines.length === 0 && result.errors.length > 0)
    lines.push(
      ...result.errors.map((error) => `- Preview setup failed: ${error.replaceAll(/\s+/g, ' ')}`),
    );
  if (lines.length === 0) lines.push('- No deployable projects changed.');
  return ['## Preview deployments', '', ...lines].join('\n');
}

async function main() {
  const file = process.argv[2];
  if (file === undefined) throw new Error('A preview result JSON file is required.');
  const result: unknown = JSON.parse(await readFile(file, 'utf8'));
  process.stdout.write(`${formatPreviewComment(result)}\n`);
}

const entry = process.argv[1];
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) {
  void main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
