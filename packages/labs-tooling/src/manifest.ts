import { z } from 'zod';

export { discoverLabs } from './discovery.js';

const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const date = z.iso.date();
const httpsUrl = z.url().refine((value) => value.startsWith('https://'), 'Expected an HTTPS URL');

const lifecycleSchema = z
  .object({
    reason: z.string().min(1).optional(),
    sunset: date.optional(),
  })
  .strict();

export const LabManifestV1Schema = z
  .object({
    manifestVersion: z.literal(1),
    slug,
    title: z.string().min(1).max(80),
    summary: z.string().min(1).max(240),
    kind: z.enum(['tool', 'visualization', 'publication']),
    profile: z.enum(['site', 'app']),
    status: z.enum(['draft', 'active', 'deprecated', 'retired', 'graduated']),
    visibility: z.enum(['listed', 'unlisted']),
    maintainers: z.array(z.string().regex(/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i)).min(1),
    dates: z
      .object({
        created: date,
        published: date.optional(),
        deprecated: date.optional(),
        retired: date.optional(),
        graduated: date.optional(),
      })
      .strict(),
    lifecycle: lifecycleSchema.optional(),
    previewImage: z
      .object({
        path: z.string().min(1),
        alt: z.string().min(1),
      })
      .strict(),
    licenses: z
      .object({
        code: z.string().min(1),
        content: z.string().min(1),
        data: z.string().min(1),
        assets: z.string().min(1),
      })
      .strict(),
    successor: z
      .object({
        url: httpsUrl,
        label: z.string().min(1),
      })
      .strict()
      .optional(),
    sourceRepository: httpsUrl.optional(),
    exceptions: z
      .array(
        z
          .object({
            kind: z.enum(['analytics', 'tombstone', 'security-header']),
            reason: z.string().min(1),
            approver: z.string().min(1),
            approved: date,
          })
          .strict(),
      )
      .optional(),
  })
  .strict()
  .superRefine((manifest, context) => {
    if (manifest.status !== 'draft' && manifest.dates.published === undefined) {
      context.addIssue({
        code: 'custom',
        path: ['dates', 'published'],
        message: 'A published date is required outside draft status.',
      });
    }

    if (manifest.status === 'deprecated') {
      if (manifest.dates.deprecated === undefined) {
        context.addIssue({
          code: 'custom',
          path: ['dates', 'deprecated'],
          message: 'A deprecated date is required for deprecated status.',
        });
      }
      if (manifest.lifecycle?.reason === undefined || manifest.lifecycle.sunset === undefined) {
        context.addIssue({
          code: 'custom',
          path: ['lifecycle'],
          message: 'Lifecycle reason and sunset date are required for deprecated status.',
        });
      }
    }

    if (manifest.status === 'retired') {
      if (manifest.dates.retired === undefined) {
        context.addIssue({
          code: 'custom',
          path: ['dates', 'retired'],
          message: 'A retired date is required for retired status.',
        });
      }
      if (manifest.lifecycle?.reason === undefined) {
        context.addIssue({
          code: 'custom',
          path: ['lifecycle', 'reason'],
          message: 'A lifecycle reason is required for retired status.',
        });
      }
    }

    if (manifest.status === 'graduated') {
      if (manifest.dates.graduated === undefined) {
        context.addIssue({
          code: 'custom',
          path: ['dates', 'graduated'],
          message: 'A graduated date is required for graduated status.',
        });
      }
      if (manifest.sourceRepository === undefined) {
        context.addIssue({
          code: 'custom',
          path: ['sourceRepository'],
          message: 'A source repository is required for graduated status.',
        });
      }
    }
  });

export type LabManifestV1 = z.infer<typeof LabManifestV1Schema>;

export function validateManifestForDirectory(input: unknown, directoryName: string): LabManifestV1 {
  const manifest = LabManifestV1Schema.parse(input);
  if (manifest.slug !== directoryName) {
    throw new Error(
      `Manifest slug "${manifest.slug}" must match its app directory "${directoryName}".`,
    );
  }
  return manifest;
}
