import { access } from 'node:fs/promises';
import path from 'node:path';

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
