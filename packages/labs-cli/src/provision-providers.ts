import { execFileSync } from 'node:child_process';
import {
  cloudflareCredential,
  cloudflareReader,
  provisionAnalytics,
  provisionCustomDomain,
  provisionRoutes,
} from '@lvbt/web-platform/cloudflare';
import {
  githubReader,
  githubVariableWriter,
  provisionEnvironment,
  provisionEnvironmentPresence,
  provisionEnvironmentSecret,
  provisionRepositoryVariable,
  provisionVariables,
} from '@lvbt/web-platform/github';
import { discoverLabs } from './discovery.js';
import { githubPreviewReader, optionalGitHubRead } from './github-preview-read.js';

interface Target {
  repository: string;
  environment: string;
  preview: {
    environment: string;
    secret: string;
    enabledVariable: string;
  };
  branch: string;
  accountId: string;
  zoneId: string;
  zoneName: string;
  hostname: string;
}

function githubWriter(root: string) {
  return (method: 'POST' | 'PATCH' | 'PUT', endpoint: string, body: unknown) => {
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
      return Promise.reject(
        new Error('GitHub write was not confirmed. Re-read provider state before retrying.'),
      );
    }
  };
}

function cloudflareWriter(token: string) {
  return async (method: 'POST' | 'PUT', endpoint: string, body: object) => {
    try {
      const response = await fetch(`https://api.cloudflare.com/client/v4/${endpoint}`, {
        method,
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
      throw new Error('Cloudflare write unconfirmed. Re-read provider state before retrying.');
    }
  };
}

function environmentSecretWriter(
  root: string,
  target: Target,
  environment: string,
  secretName: string,
) {
  return () => {
    const secret = process.env[secretName]?.trim();
    if (secret === undefined || secret.length === 0)
      return Promise.reject(
        new Error(`${secretName} is required for non-interactive provisioning.`),
      );
    try {
      execFileSync(
        'gh',
        ['secret', 'set', secretName, '--env', environment, '--repo', target.repository],
        { cwd: root, input: secret, stdio: ['pipe', 'pipe', 'pipe'], timeout: 30000 },
      );
      return Promise.resolve();
    } catch {
      return Promise.reject(
        new Error('GitHub secret write was not confirmed. Re-read provider state.'),
      );
    }
  };
}

function previewResources(
  root: string,
  target: Target,
  github: ReturnType<typeof githubReader>,
  write: ReturnType<typeof githubWriter>,
) {
  const environment = `repos/${target.repository}/environments/${encodeURIComponent(target.preview.environment)}`;
  const secrets = `${environment}/secrets`;
  const previewRead = githubPreviewReader(environment, github, (endpoint) =>
    optionalGitHubRead(root, endpoint),
  );
  return [
    provisionEnvironmentPresence(
      { repository: target.repository, environment: target.preview.environment },
      previewRead,
      (method, endpoint, body) => {
        if (endpoint !== environment)
          throw new Error('Preview environment write is outside the declared target.');
        return write(method, endpoint, body);
      },
    ),
    provisionEnvironmentSecret(
      {
        repository: target.repository,
        environment: target.preview.environment,
        name: target.preview.secret,
      },
      () => previewRead(secrets),
      environmentSecretWriter(root, target, target.preview.environment, target.preview.secret),
    ),
    provisionRepositoryVariable(
      {
        repository: target.repository,
        name: target.preview.enabledVariable,
        value: 'true',
      },
      github,
      (method, endpoint, body) => write(method, endpoint, body),
    ),
  ];
}

export async function provisionResources(root: string, target: Target) {
  const github = githubReader(root);
  const environment = `repos/${target.repository}/environments/${encodeURIComponent(target.environment)}`;
  const environmentVariables = `${environment}/variables`;
  const environmentSecrets = `${environment}/secrets`;
  const token = cloudflareCredential(root);
  const cloudflare = cloudflareReader(token);
  const account = `accounts/${target.accountId}`;
  const domains = `${account}/workers/domains?hostname=${encodeURIComponent(target.hostname)}`;
  const analytics = `${account}/rum/site_info/list`;
  const routes = `zones/${target.zoneId}/workers/routes`;
  const workers = (await discoverLabs(root))
    .filter((lab) => lab.status !== 'draft')
    .map((lab) => ({ slug: lab.slug, name: `lvbt-labs-${lab.slug}` }));
  const githubWrite = githubWriter(root);
  const cloudflareWrite = cloudflareWriter(token);
  const resources = [
    ...provisionVariables(target, github, githubVariableWriter(root, target.repository)),
    provisionEnvironment(target, github, (method, endpoint, body) => {
      if (
        endpoint !== (method === 'PUT' ? environment : `${environment}/deployment-branch-policies`)
      )
        throw new Error('Environment write is outside the declared target.');
      return githubWrite(method, endpoint, body);
    }),
    provisionEnvironmentSecret(
      {
        repository: target.repository,
        environment: target.environment,
        name: 'CLOUDFLARE_API_TOKEN',
      },
      () => github(environmentSecrets),
      environmentSecretWriter(root, target, target.environment, 'CLOUDFLARE_API_TOKEN'),
    ),
    ...previewResources(root, target, github, githubWrite),
    provisionCustomDomain(
      {
        ...target,
        service: 'lvbt-labs-home',
      },
      () => cloudflare.list(domains),
      (body) => cloudflareWrite('PUT', `${account}/workers/domains`, body),
    ),
    ...provisionRoutes(
      { ...target, workers },
      () => cloudflare.list(routes),
      (body) => cloudflareWrite('POST', routes, body),
    ),
    ...provisionAnalytics(target, {
      readSites: () => cloudflare.list(analytics),
      createSite: (body) => cloudflareWrite('POST', `${account}/rum/site_info`, body),
      readVariables: () => github(environmentVariables),
      writeVariable: (method, endpoint, body) => {
        if (
          endpoint !==
          (method === 'POST'
            ? environmentVariables
            : `${environmentVariables}/CLOUDFLARE_WEB_ANALYTICS_TOKEN`)
        )
          throw new Error('Analytics variable write is outside the declared target.');
        return githubWrite(method, endpoint, body);
      },
    }),
  ];
  return resources;
}
