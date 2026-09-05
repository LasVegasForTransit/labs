import { execFileSync } from 'node:child_process';
import { githubReader } from './github-read.js';
import { cloudflareCredential, cloudflareReader } from './cloudflare-read.js';
import { provisionVariables, githubVariableWriter } from './provision-variables.js';
import { provisionEnvironment } from './provision-environment.js';
import { provisionRoutes } from './provision-routes.js';
import { discoverLabs } from './discovery.js';

interface Target {
  repository: string;
  environment: string;
  branch: string;
  accountId: string;
  zoneId: string;
  hostname: string;
}

export async function provisionResources(root: string, target: Target) {
  const github = githubReader(root);
  const environment = `repos/${target.repository}/environments/${encodeURIComponent(target.environment)}`;
  const token = cloudflareCredential(root);
  const cloudflare = cloudflareReader(token);
  const routes = `zones/${target.zoneId}/workers/routes`;
  const workers = (await discoverLabs(root))
    .filter((lab) => lab.status !== 'draft')
    .map((lab) => ({ slug: lab.slug, name: `lvbt-labs-${lab.slug}` }));
  return [
    ...provisionVariables(target, github, githubVariableWriter(root, target.repository)),
    provisionEnvironment(target, github, (method, endpoint, body) => {
      if (
        endpoint !== (method === 'PUT' ? environment : `${environment}/deployment-branch-policies`)
      )
        throw new Error('Environment write is outside the declared target.');
      try {
        execFileSync(
          'gh',
          ['api', '--hostname', 'github.com', '--method', method, '--input', '-', endpoint],
          {
            cwd: root,
            input: JSON.stringify(body),
            stdio: ['pipe', 'pipe', 'pipe'],
            timeout: 30000,
          },
        );
        return Promise.resolve();
      } catch {
        throw new Error('Environment write unconfirmed. Re-read provider state before retrying.');
      }
    }),
    ...provisionRoutes(
      { ...target, workers },
      () => cloudflare.list(routes),
      async (body) => {
        try {
          const response = await fetch(`https://api.cloudflare.com/client/v4/${routes}`, {
            method: 'POST',
            redirect: 'error',
            signal: AbortSignal.timeout(15000),
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
          const result: unknown = await response.json();
          if (
            !response.ok ||
            typeof result !== 'object' ||
            result === null ||
            !('success' in result) ||
            result.success !== true
          )
            throw new Error('Unsuccessful response.');
        } catch {
          throw new Error('Route write unconfirmed. Re-read provider state before retrying.');
        }
      },
    ),
  ];
}
