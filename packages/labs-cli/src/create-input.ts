import { readFile } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
import { parseArgs } from 'node:util';
import { LabManifestV1Schema } from './manifest.js';

const fields = {
  slug: 'Permanent slug (lowercase kebab-case)',
  title: 'Project name',
  summary: 'Public summary',
  profile: 'Profile (site or app)',
  kind: 'Kind (tool, visualization, or publication)',
  maintainers: 'Maintainer GitHub usernames (comma-separated)',
  'preview-image': 'Preview image public path',
  'preview-alt': 'Preview image description',
  'content-license': 'Content license',
  'data-license': 'Data license',
  'asset-license': 'Asset license',
};

interface InputOptions {
  interactive?: boolean;
  question?: (label: string) => Promise<string>;
  today?: string;
}

async function collectFields(
  values: Record<string, string | boolean | undefined>,
  options: InputOptions,
) {
  const interactive = (options.interactive ?? process.stdin.isTTY) && !values.json;
  const prompt =
    interactive && options.question === undefined
      ? createInterface({ input: process.stdin, output: process.stderr })
      : undefined;
  const question = options.question ?? prompt?.question.bind(prompt);
  const answers: Record<string, string> = {};
  try {
    for (const [name, label] of Object.entries(fields)) {
      const supplied = values[name];
      const answer =
        typeof supplied === 'string'
          ? supplied
          : interactive && question !== undefined
            ? await question(`${label}: `)
            : '';
      if (answer.trim() === '') throw new Error(`--${name} is required.`);
      answers[name] = answer.trim();
    }
  } finally {
    prompt?.close();
  }
  return answers;
}

export async function readCreateInput(args: string[], options: InputOptions = {}) {
  const parsed = parseArgs({
    args,
    options: {
      ...Object.fromEntries(Object.keys(fields).map((name) => [name, { type: 'string' as const }])),
      manifest: { type: 'string' },
      created: { type: 'string' },
      apply: { type: 'boolean' },
      'dry-run': { type: 'boolean' },
      json: { type: 'boolean' },
    },
  });
  const values: Record<string, string | boolean | undefined> = parsed.values;
  if (values.apply && values['dry-run'])
    throw new Error('--apply and --dry-run cannot be used together.');
  if (
    values.manifest &&
    [...Object.keys(fields), 'created'].some((name) => values[name] !== undefined)
  )
    throw new Error('Use either --manifest or individual manifest fields, not both.');
  let source: unknown;
  if (typeof values.manifest === 'string') {
    source = JSON.parse(await readFile(values.manifest, 'utf8'));
  } else {
    const answers = await collectFields(values, options);
    source = {
      manifestVersion: 1,
      slug: answers.slug,
      title: answers.title,
      summary: answers.summary,
      profile: answers.profile,
      kind: answers.kind,
      status: 'draft',
      visibility: 'unlisted',
      maintainers: answers.maintainers?.split(',').map((name) => name.trim()),
      dates: { created: values.created ?? options.today ?? new Date().toISOString().slice(0, 10) },
      previewImage: { path: answers['preview-image'], alt: answers['preview-alt'] },
      licenses: {
        code: 'MIT',
        content: answers['content-license'],
        data: answers['data-license'],
        assets: answers['asset-license'],
      },
    };
  }
  const manifest = LabManifestV1Schema.parse(source);
  if (manifest.slug === 'home' || manifest.status !== 'draft' || manifest.visibility !== 'unlisted')
    throw new Error('New labs require a unique slug, draft status, and unlisted visibility.');
  if (manifest.licenses.code !== 'MIT') throw new Error('New labs use the MIT code license.');
  return { manifest, apply: values.apply === true, json: values.json === true };
}
