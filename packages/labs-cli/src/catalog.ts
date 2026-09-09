import type { LabManifestV1 } from './manifest.js';

export function isListedLab(manifest: LabManifestV1): boolean {
  return (
    manifest.slug !== 'home' && manifest.status !== 'draft' && manifest.visibility === 'listed'
  );
}
