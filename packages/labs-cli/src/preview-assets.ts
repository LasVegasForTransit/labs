import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';
import { z } from 'zod';

export async function hasStaticPreview(root: string, slug: string): Promise<boolean> {
  const file = path.join(root, 'apps', slug, 'wrangler.jsonc');
  const parsed = ts.parseConfigFileTextToJson(file, await readFile(file, 'utf8'));
  if (parsed.error !== undefined) throw new Error(`Invalid preview configuration: ${file}`);
  const configuration = z
    .object({ assets: z.object({ directory: z.string() }).optional() })
    .parse(parsed.config);
  return configuration.assets !== undefined;
}

/** Turbo owns the build when acceptance runs alongside other application previews. */
export async function preparePreviewAssets(
  root: string,
  slugs: readonly string[],
  prebuilt: boolean,
  build: () => Promise<void>,
): Promise<void> {
  if (!prebuilt) await build();
  for (const slug of slugs) {
    const entry = path.join(root, 'apps', slug, 'dist', 'index.html');
    try {
      await access(entry);
    } catch {
      throw new Error(`Missing built preview assets for ${slug}; run pnpm build first.`);
    }
  }
}
