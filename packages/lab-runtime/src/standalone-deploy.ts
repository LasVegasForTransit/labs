import { z } from 'zod';

const markerSchema = z
  .object({
    formatVersion: z.literal(1),
    slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    commit: z.string().regex(/^[a-f0-9]{40}$/),
    artifactHash: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();

type Marker = z.infer<typeof markerSchema>;

const inputSchema = z
  .object({
    slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    commit: z.string().regex(/^[a-f0-9]{40}$/),
    dryRun: z.boolean(),
  })
  .strict();

export function standaloneDeploymentInput(args: string[]) {
  let slug: string | undefined;
  let dryRun = false;
  for (const argument of args) {
    if (argument === '--dry-run') dryRun = true;
    else if (argument.startsWith('--')) throw new Error(`Unsupported option: ${argument}`);
    else if (slug === undefined) slug = argument;
    else throw new Error('Provide one standalone lab slug.');
  }
  if (slug === undefined) throw new Error('Provide one standalone lab slug.');
  return { slug, dryRun };
}

export interface StandaloneDeploymentOperations {
  build(): Promise<void>;
  guard(): void | Promise<void>;
  seal(): Promise<Marker>;
  activeVersion(): Promise<string | null>;
  upload(marker: Marker, dryRun: boolean): Promise<string | null>;
  verify(marker: Marker, version: string): Promise<void>;
  journal(phase: string, details?: unknown): Promise<void>;
}

export async function deployStandalone(
  raw: z.infer<typeof inputSchema>,
  operations: StandaloneDeploymentOperations,
) {
  const input = inputSchema.parse(raw);
  await operations.build();
  await operations.guard();
  const marker = markerSchema.parse(await operations.seal());
  if (marker.slug !== input.slug || marker.commit !== input.commit)
    throw new Error('The sealed artifact does not match the standalone release.');
  await operations.guard();
  if (input.dryRun) {
    const version = await operations.upload(marker, true);
    if (version !== null) throw new Error('A dry run cannot return a deployed Worker version.');
    return { command: 'deploy', ok: true, changed: false, version, marker };
  }
  const previousVersion = await operations.activeVersion();
  await operations.journal('prepared', { marker, previousVersion });
  let version: string | null = null;
  try {
    version = await operations.upload(marker, false);
    if (version === null) throw new Error('The Worker upload returned no version.');
    await operations.journal('uploaded', { marker, version, previousVersion });
    await operations.verify(marker, version);
    await operations.journal('verified', { marker, version, previousVersion });
    return { command: 'deploy', ok: true, changed: true, version, previousVersion, marker };
  } catch (error) {
    await operations.journal(version === null ? 'upload-unconfirmed' : 'verification-failed', {
      marker,
      version,
      previousVersion,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new Error('The standalone deployment could not be confirmed; inspect its journal.', {
      cause: error,
    });
  }
}

export { standaloneDeploymentOperations } from './standalone-deploy-operations.js';
