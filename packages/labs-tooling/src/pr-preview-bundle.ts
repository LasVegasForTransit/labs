import { mkdir, mkdtemp, readFile, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';
import { z } from 'zod';
import { readArchiveFiles } from './archive-files.js';
import { previewConfiguration } from './pr-preview-config.js';
import { sealArtifact } from './release-artifact.js';

export async function preparePreviewBundle(
  app: string,
  identity: { slug: string; worker: string; commit: string; mode: 'version' | 'temporary' },
  parent: string,
) {
  z.string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .parse(identity.slug);
  z.string()
    .regex(/^[a-f0-9]{40}$/)
    .parse(identity.commit);
  const sourceConfig = path.join(app, 'wrangler.jsonc');
  const parsed = ts.parseConfigFileTextToJson(sourceConfig, await readFile(sourceConfig, 'utf8'));
  if (parsed.error) throw new Error('Invalid Worker configuration.');
  const original = z
    .object({
      name: z.literal(`lvbt-labs-${identity.slug}`),
      assets: z.object({ directory: z.string() }),
    })
    .parse(parsed.config);
  const config = previewConfiguration(
    parsed.config,
    identity.worker,
    path.resolve(parent, 'assets'),
    identity.mode,
  );
  const directory = await realpath(app);
  const source = await realpath(path.resolve(app, original.assets.directory));
  const relative = path.relative(directory, source);
  if (
    relative === '' ||
    relative === '..' ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  )
    throw new Error('Preview assets must remain inside the owning application.');
  const files = await readArchiveFiles(source);
  for (const [name, contents] of files) {
    if (
      /\.(?:html|[cm]?js)$/.test(name) &&
      /cloudflareinsights\.com|data-cf-beacon/.test(contents.toString('utf8'))
    )
      throw new Error(
        'Preview assets contain Cloudflare Analytics. Rebuild with analytics disabled.',
      );
  }
  files.set(
    '_headers',
    Buffer.from(
      `${files.get('_headers')?.toString('utf8') ?? ''}\n/*\n  X-Robots-Tag: noindex, nofollow, noarchive\n`,
    ),
  );
  files.set('robots.txt', Buffer.from('User-agent: *\nDisallow: /\n'));
  await mkdir(parent, { recursive: true });
  const output = await mkdtemp(path.join(parent, 'preview-'));
  const assets = path.join(output, 'assets');
  for (const [name, contents] of files) {
    const file = path.join(assets, name);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, contents, { flag: 'wx' });
  }
  const marker = await sealArtifact(assets, { slug: identity.slug, commit: identity.commit });
  await writeFile(
    path.join(output, 'wrangler.json'),
    JSON.stringify({ ...config, assets: { ...config.assets, directory: assets } }),
    { flag: 'wx' },
  );
  return { directory: output, marker };
}
