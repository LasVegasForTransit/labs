import { LabManifestV1Schema, type LabManifestV1 } from './manifest.js';
import { randomUUID } from 'node:crypto';
import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { parseArgs } from 'node:util';
import { format, resolveConfig } from 'prettier';
import { parseManifestSource } from './manifest-source.js';

export interface DeprecationDetails {
  reason: string;
  sunset: string;
  successor?: LabManifestV1['successor'];
}

type Question = (label: string) => Promise<string>;

export function deprecateManifest(
  manifest: LabManifestV1,
  details: DeprecationDetails,
  date: string,
): LabManifestV1 {
  if (manifest.slug === 'home') {
    throw new Error('The home catalog cannot be deprecated.');
  }
  if (manifest.status !== 'active' && manifest.status !== 'deprecated') {
    throw new Error('Only active or deprecated labs can be deprecated.');
  }
  const deprecated = manifest.dates.deprecated ?? date;
  const result = LabManifestV1Schema.parse({
    ...manifest,
    status: 'deprecated',
    dates: { ...manifest.dates, deprecated },
    lifecycle: { reason: details.reason.trim(), sunset: details.sunset },
    ...(details.successor === undefined ? {} : { successor: details.successor }),
  });
  if (result.dates.published !== undefined && deprecated < result.dates.published) {
    throw new Error('Deprecation cannot precede publication.');
  }
  if (details.sunset < deprecated) {
    throw new Error('The sunset date cannot precede deprecation.');
  }
  return result;
}

async function promptForDetails(
  fields: {
    slug: string | undefined;
    reason: string | undefined;
    sunset: string | undefined;
  },
  json: boolean,
  ask?: Question,
) {
  let { slug, reason, sunset } = fields;
  const interactive = !json && (ask !== undefined || process.stdin.isTTY);
  if (interactive) {
    const prompt =
      ask === undefined
        ? createInterface({ input: process.stdin, output: process.stderr })
        : undefined;
    const question =
      ask ??
      ((label: string) => {
        if (prompt === undefined) throw new Error('Interactive prompt is unavailable.');
        return prompt.question(label);
      });
    try {
      slug ??= await question('Lab slug: ');
      reason ??= await question('Reason for deprecation: ');
      sunset ??= await question('Sunset date (YYYY-MM-DD): ');
    } finally {
      prompt?.close();
    }
  }
  if (slug === undefined || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))
    throw new Error('Provide a lowercase kebab-case slug.');
  if (reason === undefined || sunset === undefined)
    throw new Error('--reason and --sunset are required.');
  return { slug, reason, sunset };
}

export async function deprecationInput(arguments_: string[], ask?: Question) {
  const { values, positionals } = parseArgs({
    args: arguments_,
    allowPositionals: true,
    options: {
      slug: { type: 'string' },
      reason: { type: 'string' },
      sunset: { type: 'string' },
      successor: { type: 'string' },
      'successor-label': { type: 'string' },
      apply: { type: 'boolean' },
      'dry-run': { type: 'boolean' },
      json: { type: 'boolean' },
    },
  });
  if (values.apply && values['dry-run'])
    throw new Error('--apply and --dry-run cannot be used together.');
  if (positionals.length > 1 || (positionals.length > 0 && values.slug !== undefined)) {
    throw new Error('Provide one lab slug.');
  }
  const { slug, reason, sunset } = await promptForDetails(
    {
      slug: values.slug ?? positionals[0],
      reason: values.reason,
      sunset: values.sunset,
    },
    values.json === true,
    ask,
  );
  if ((values.successor === undefined) !== (values['successor-label'] === undefined)) {
    throw new Error('Provide both --successor and --successor-label.');
  }
  return {
    slug,
    apply: values.apply === true,
    details: {
      reason,
      sunset,
      ...(values.successor === undefined
        ? {}
        : { successor: { url: values.successor, label: values['successor-label'] ?? '' } }),
    },
  };
}

export async function deprecateLab(
  root: string,
  arguments_: string[],
  date = new Date().toISOString().slice(0, 10),
) {
  const input = await deprecationInput(arguments_);
  const file = path.join(root, 'apps', input.slug, 'lab.config.ts');
  const original = await readFile(file, 'utf8');
  const parsed = parseManifestSource(original, input.slug);
  const manifest = deprecateManifest(parsed.manifest, input.details, date);
  const updated = await format(parsed.update(manifest), {
    ...(await resolveConfig(file)),
    filepath: file,
  });
  const wouldChange = original !== updated;
  if (input.apply && wouldChange) {
    const temporary = `${file}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, updated, { flag: 'wx' });
      if ((await readFile(file, 'utf8')) !== original)
        throw new Error('The manifest changed during deprecation; retry after reviewing it.');
      await rename(temporary, file);
    } finally {
      await rm(temporary, { force: true });
    }
  }
  return {
    command: 'deprecate',
    ok: true,
    changed: input.apply && wouldChange,
    wouldChange,
    manifest,
  };
}
