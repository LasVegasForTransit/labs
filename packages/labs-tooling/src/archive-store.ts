import { lstat, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { archiveChecksums, readArchiveFiles } from './archive-files.js';
import { LabManifestV1Schema, type LabManifestV1 } from './manifest.js';
import { writeProject } from './create-write.js';

const provenanceSchema = z
  .object({
    formatVersion: z.literal(1),
    sourceCommit: z.string().regex(/^[a-f0-9]{40}$/),
    sourceRepository: z.url().refine((url) => url.startsWith('https://')),
    sourcePath: z.string(),
  })
  .strict();

function retiredManifest(input: unknown) {
  const manifest = LabManifestV1Schema.parse(input);
  if (manifest.slug === 'home' || manifest.status !== 'retired')
    throw new Error('A retirement archive requires a retired non-home manifest.');
  return manifest;
}

export function retirementIdentity(identity: {
  manifest: LabManifestV1;
  sourceCommit: string;
  sourceRepository: string;
}) {
  const manifest = retiredManifest(identity.manifest);
  const provenance = provenanceSchema.parse({
    formatVersion: 1,
    sourceCommit: identity.sourceCommit,
    sourceRepository: identity.sourceRepository,
    sourcePath: `apps/${manifest.slug}`,
  });
  return { manifest, provenance };
}

export async function verifyStoredArchive(directory: string) {
  const files = await readArchiveFiles(directory);
  const checksums = files.get('checksums.sha256')?.toString('utf8');
  files.delete('checksums.sha256');
  if (checksums !== archiveChecksums(files))
    throw new Error('Archive checksum verification failed.');
  const manifest = retiredManifest(
    JSON.parse(files.get('manifest.json')?.toString('utf8') ?? 'null'),
  );
  if (files.has('site/index.html') === files.has(`site/${manifest.slug}/index.html`))
    throw new Error('Expected one root or slug-prefixed archive index.');
  const provenance = provenanceSchema.parse(
    JSON.parse(files.get('provenance.json')?.toString('utf8') ?? 'null'),
  );
  if (
    provenance.sourcePath !== `apps/${manifest.slug}` ||
    path.basename(directory) !== manifest.slug
  )
    throw new Error('Archive metadata does not match its permanent slug.');
  const site = new Map(
    [...files]
      .filter(([name]) => name.startsWith('site/'))
      .map(([name, bytes]) => [name.slice(5), bytes]),
  );
  return { manifest, provenance, site };
}

export async function storeRetirementArchive(
  root: string,
  identity: { manifest: LabManifestV1; sourceCommit: string; sourceRepository: string },
  sourceDirectory: string,
  verify: (stagedSite: string) => Promise<void>,
) {
  const { manifest, provenance } = retirementIdentity(identity);
  const site = await readArchiveFiles(sourceDirectory);
  if (site.has('index.html') === site.has(`${manifest.slug}/index.html`))
    throw new Error('Expected one root or slug-prefixed archive index.');
  const files = new Map([...site].map(([name, content]) => [`site/${name}`, content]));
  files.set('manifest.json', Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`));
  files.set('provenance.json', Buffer.from(`${JSON.stringify(provenance, null, 2)}\n`));
  files.set('checksums.sha256', Buffer.from(archiveChecksums(files)));
  const expectedChecksums = archiveChecksums(files);
  const parent = path.join(root, 'retired');
  await mkdir(parent, { recursive: true });
  if (!(await lstat(parent)).isDirectory())
    throw new Error('Retired artifacts need a regular directory.');
  const directory = path.join(parent, manifest.slug);
  const verification = { passed: false };
  try {
    await writeProject(directory, Object.fromEntries(files), async (staged) => {
      const stagedSite = path.join(staged, 'site');
      await verify(stagedSite);
      if (archiveChecksums(await readArchiveFiles(staged)) !== expectedChecksums)
        throw new Error('Archive files changed during verification.');
      verification.passed = true;
    });
  } catch (error) {
    if (!verification.passed || (error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    if (archiveChecksums(await readArchiveFiles(directory)) !== expectedChecksums)
      throw new Error(`A different archive already exists at ${directory}.`, { cause: error });
    return { changed: false, directory, manifest, provenance };
  }
  await verifyStoredArchive(directory);
  return { changed: true, directory, manifest, provenance };
}
