export interface DeploymentReceipt {
  version: string;
  previousVersion: string | null;
}

export interface DeploymentOperations {
  build(packages: string[]): Promise<void>;
  deploy(slug: string): Promise<DeploymentReceipt>;
  verify(slug: string, receipt: DeploymentReceipt): Promise<void>;
}

interface DeploymentResult {
  slug: string;
  status: 'verified' | 'failed' | 'skipped';
  receipt?: DeploymentReceipt;
  error?: string;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function deployProjects(
  plan: { packages: string[]; deploy: string[] },
  operations: DeploymentOperations,
) {
  const results: DeploymentResult[] = [];
  if (plan.packages.length === 0 && plan.deploy.length === 0) return { ok: true, results };
  try {
    await operations.build(plan.packages);
  } catch (error) {
    return { ok: false, results, buildError: message(error) };
  }
  const slugs = [...new Set(plan.deploy)];
  const ordered = [
    ...slugs.filter((slug) => slug !== 'home'),
    ...slugs.filter((slug) => slug === 'home'),
  ];
  for (const slug of ordered) {
    if (slug === 'home' && results.some((result) => result.status === 'failed')) {
      results.push({
        slug,
        status: 'skipped',
        error: 'Home is withheld because an app failed deployment or verification.',
      });
      continue;
    }
    let receipt: DeploymentReceipt | undefined;
    try {
      receipt = await operations.deploy(slug);
      await operations.verify(slug, receipt);
      results.push({ slug, status: 'verified', receipt });
    } catch (error) {
      results.push({
        slug,
        status: 'failed',
        error: message(error),
        ...(receipt === undefined ? {} : { receipt }),
      });
    }
  }
  return { ok: results.every((result) => result.status === 'verified'), results };
}
