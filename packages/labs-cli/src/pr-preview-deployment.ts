import { execFile, execFileSync } from 'node:child_process';
import { appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { z } from 'zod';
import type { CloudflareRead } from '@lvbt/web-platform/cloudflare';
import {
  publishPreviews,
  uploadPreview,
  verifyReleaseResponse,
  type PreviewReceipt,
  type ReleaseMarker,
} from '@lvbt/web-platform/release';
import { preparePreviewBundle } from './pr-preview-bundle.js';
import type { PreviewTarget } from './pr-preview-plan.js';

const execute = promisify(execFile);

const identitySchema = z.object({
  repository: z.string().regex(/^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/),
  pullRequest: z.number().int().positive(),
  commit: z.string().regex(/^[a-f0-9]{40}$/),
});
const pullRequestSchema = z.object({
  state: z.literal('open'),
  head: z.object({
    sha: z.string().regex(/^[a-f0-9]{40}$/),
    repo: z.object({ full_name: z.string() }),
  }),
});

interface PreviewIdentityDependencies {
  checkout(root: string): string;
  pullRequest(repository: string, pullRequest: number): Promise<unknown>;
}

const defaultIdentityDependencies: PreviewIdentityDependencies = {
  checkout: (root) =>
    execFileSync('git', ['rev-parse', '--verify', 'HEAD^{commit}'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim(),
  pullRequest: (repository, pullRequest) => {
    const output = execFileSync('gh', ['api', `repos/${repository}/pulls/${pullRequest}`], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 30000,
    });
    return Promise.resolve(JSON.parse(output) as unknown);
  },
};

export async function assertPreviewHead(
  root: string,
  input: z.input<typeof identitySchema>,
  dependencies: PreviewIdentityDependencies = defaultIdentityDependencies,
) {
  const identity = identitySchema.parse(input);
  const checkout = dependencies.checkout(root);
  const pullRequest = pullRequestSchema.parse(
    await dependencies.pullRequest(identity.repository, identity.pullRequest),
  );
  if (
    checkout !== identity.commit ||
    pullRequest.head.sha !== identity.commit ||
    pullRequest.head.repo.full_name !== identity.repository
  )
    throw new Error('Pull request preview identity does not match the checked-out commit.');
}

function requireNoIndex(response: Response) {
  if (!response.headers.get('x-robots-tag')?.toLowerCase().includes('noindex'))
    throw new Error('Preview responses require an X-Robots-Tag noindex policy.');
}

export async function verifyPreviewReceipt(
  target: PreviewTarget,
  receipt: { version: string; url: string },
  marker: ReleaseMarker,
  request: typeof fetch = fetch,
) {
  const origin = new URL(receipt.url);
  const projectPath = target.slug === 'home' ? '/' : `/${target.slug}/`;
  const options: RequestInit = {
    redirect: 'error',
    cache: 'no-store',
    signal: AbortSignal.timeout(15000),
  };
  const release = await request(new URL(`${projectPath}lvbt-release.json`, origin), options);
  requireNoIndex(release);
  await verifyReleaseResponse(release, marker);
  const page = await request(new URL(projectPath, origin), options);
  requireNoIndex(page);
  if (page.status !== 200) throw new Error(`Preview page returned HTTP ${page.status}.`);
  const robots = await request(new URL('/robots.txt', origin), options);
  requireNoIndex(robots);
  if (robots.status !== 200 || !(await robots.text()).includes('Disallow: /'))
    throw new Error('Preview robots policy does not block indexing.');
}

interface PreviewPlan {
  head: string;
  packages: string[];
  deploy: string[];
}

type Run = (args: string[], root: string) => Promise<string>;
interface PreviewDeploymentDependencies {
  run?: Run;
  assertCurrent?: () => Promise<void>;
  prepare?: (
    app: string,
    identity: { slug: string; worker: string; commit: string; mode: 'version' | 'temporary' },
    parent: string,
  ) => Promise<{ directory: string; marker: ReleaseMarker }>;
  upload?: (
    target: {
      directory: string;
      worker: string;
      mode: 'version' | 'temporary';
      repository: string;
      pullRequest: number;
      commit: string;
      accountId: string;
    },
    read: CloudflareRead,
  ) => Promise<PreviewReceipt>;
  verify?: typeof verifyPreviewReceipt;
  record?: (entry: unknown) => Promise<void>;
}

const run: Run = async (args, root) => {
  const result = await execute('pnpm', args, {
    cwd: root,
    env: { ...process.env, WRANGLER_LOG_SANITIZE: 'true' },
    maxBuffer: 16 * 1024 * 1024,
  });
  return result.stdout;
};

export async function publishPullRequestPreviews(input: {
  root: string;
  identity: z.input<typeof identitySchema> & { accountId: string };
  plan: PreviewPlan;
  targets: PreviewTarget[];
  read: CloudflareRead;
  dependencies?: PreviewDeploymentDependencies;
}) {
  const { root, plan, targets, read, dependencies = {} } = input;
  const identity = identitySchema.parse(input.identity);
  const accountId = z.string().min(1).parse(input.identity.accountId);
  const command = dependencies.run ?? run;
  const prepare = dependencies.prepare ?? preparePreviewBundle;
  const upload = dependencies.upload ?? ((target, reader) => uploadPreview(target, reader));
  const verify = dependencies.verify ?? verifyPreviewReceipt;
  const bundles = new Map<string, { directory: string; marker: ReleaseMarker }>();
  const parent = path.join(root, '.wrangler', 'previews', `pr-${identity.pullRequest}`);
  const journal = path.join(parent, 'journal.jsonl');
  const assertCurrent = dependencies.assertCurrent ?? (() => assertPreviewHead(root, identity));
  const record =
    dependencies.record ??
    (async (entry: unknown) => {
      await mkdir(parent, { recursive: true });
      await appendFile(journal, `${JSON.stringify(entry)}\n`);
    });
  return publishPreviews(targets, {
    async build() {
      await command(['check'], root);
      if (plan.packages.length > 0)
        await command(
          ['exec', 'turbo', 'run', 'build', ...plan.packages.map((name) => `--filter=${name}`)],
          root,
        );
      await assertCurrent();
      for (const target of targets) {
        if (target.mode === 'staging')
          throw new Error('Stateful previews require a dedicated staging deployment.');
        bundles.set(
          target.slug,
          await prepare(
            path.join(root, 'apps', target.slug),
            {
              slug: target.slug,
              worker: target.worker,
              commit: plan.head,
              mode: target.mode,
            },
            parent,
          ),
        );
      }
    },
    assertCurrent,
    record,
    async upload(target): Promise<PreviewReceipt> {
      const bundle = bundles.get(target.slug);
      if (bundle === undefined) throw new Error(`No preview bundle exists for ${target.slug}.`);
      if (target.mode === 'staging') throw new Error('Stateful preview staging is not configured.');
      return upload(
        {
          directory: bundle.directory,
          worker: target.worker,
          mode: target.mode,
          repository: identity.repository,
          pullRequest: identity.pullRequest,
          commit: plan.head,
          accountId,
        },
        read,
      );
    },
    async verify(target, receipt) {
      const bundle = bundles.get(target.slug);
      if (bundle === undefined) throw new Error(`No preview bundle exists for ${target.slug}.`);
      await verify(target, receipt, bundle.marker);
    },
  });
}
