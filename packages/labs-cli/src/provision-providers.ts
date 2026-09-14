import { execFile, execFileSync } from 'node:child_process';
import { lstat, readFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import {
  cloudflareCredential,
  cloudflareReader,
  provisionAnalytics,
  provisionCustomDomain,
  provisionRoutes,
  provisionWorkerPresence,
  provisionWorkerPreviewUrls,
} from '@lvbt/web-platform/cloudflare';
import {
  githubReader,
  githubVariableWriter,
  provisionEnvironment,
  provisionEnvironmentPresence,
  provisionEnvironmentSecret,
  provisionRepository,
  provisionRepositoryRuleset,
  provisionRepositoryVariable,
  provisionVariables,
} from '@lvbt/web-platform/github';
import { discoverLabs } from './discovery.js';
import { githubPreviewReader, optionalGitHubRead } from './github-preview-read.js';
import type { LabManifestV1 } from './manifest.js';

const execute = promisify(execFile);

interface CommandOptions {
  cwd: string;
}

type RunCommand = (command: string, args: string[], options: CommandOptions) => Promise<void>;

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

async function isRegularFile(file: string) {
  try {
    return (await lstat(file)).isFile();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

const runCommand: RunCommand = async (command, args, options) => {
  await execute(command, args, {
    cwd: options.cwd,
    env: process.env,
    maxBuffer: 10 * 1024 * 1024,
  });
};

export async function provisionWorkerResources(
  root: string,
  labs: LabManifestV1[],
  readWorkers: () => Promise<unknown>,
  run: RunCommand = runCommand,
) {
  const resources = [];
  for (const lab of labs.filter(({ status }) => ['active', 'deprecated'].includes(status))) {
    const app = path.join(root, 'apps', lab.slug);
    if (!(await isRegularFile(path.join(app, 'lab.config.ts')))) continue;
    const wrangler = path.join(app, 'wrangler.jsonc');
    if (!(await isRegularFile(wrangler)))
      throw new Error(`Published source lab ${lab.slug} requires ${wrangler}.`);
    const worker = `lvbt-labs-${lab.slug}`;
    resources.push(
      provisionWorkerPresence({ name: worker }, readWorkers, async () => {
        await run('pnpm', ['--filter', `@lvbt/lab-${lab.slug}`, 'build'], { cwd: root });
        await run(
          'pnpm',
          [
            'exec',
            'wrangler',
            'versions',
            'upload',
            '--strict',
            '--name',
            worker,
            '--message',
            `Provision inactive Worker identity for ${lab.slug}.`,
          ],
          { cwd: app },
        );
      }),
    );
  }
  return resources;
}

export function provisionWorkerPreviewResources(
  labs: LabManifestV1[],
  read: (worker: string) => Promise<unknown>,
  write: (
    worker: string,
    settings: { enabled: boolean; previews_enabled: boolean },
  ) => Promise<void>,
) {
  return labs
    .filter(({ status }) => !['draft', 'graduated'].includes(status))
    .map(({ slug }) => {
      const worker = `lvbt-labs-${slug}`;
      return provisionWorkerPreviewUrls(
        { name: worker },
        () => read(worker),
        (settings) => write(worker, settings),
      );
    });
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
  ] as const;
}

function githubResourceGroups(root: string, target: Target, ruleset: unknown) {
  const github = githubReader(root);
  const write = githubWriter(root);
  const base = `repos/${target.repository}`;
  const environment = `${base}/environments/${encodeURIComponent(target.environment)}`;
  const preview = previewResources(root, target, github, write);
  const repository = provisionRepository(target, () => optionalGitHubRead(root, base), write);
  const repositoryConfiguration = [
    provisionRepositoryRuleset(
      { repository: target.repository, ruleset },
      (endpoint) => optionalGitHubRead(root, endpoint),
      write,
    ),
    ...provisionVariables(target, github, githubVariableWriter(root, target.repository)),
    provisionEnvironmentPresence(
      { repository: target.repository, environment: target.environment },
      (endpoint) => optionalGitHubRead(root, endpoint),
      (method, endpoint, body) => {
        if (endpoint !== environment)
          throw new Error('Production environment write is outside the declared target.');
        return write(method, endpoint, body);
      },
    ),
    preview[0],
    preview[2],
  ];
  const deploymentConfiguration = [
    provisionEnvironment(target, github, (method, endpoint, body) => {
      if (
        endpoint !== (method === 'PUT' ? environment : `${environment}/deployment-branch-policies`)
      )
        throw new Error('Environment write is outside the declared target.');
      return write(method, endpoint, body);
    }),
    provisionEnvironmentSecret(
      {
        repository: target.repository,
        environment: target.environment,
        name: 'CLOUDFLARE_API_TOKEN',
      },
      () => github(`${environment}/secrets`),
      environmentSecretWriter(root, target, target.environment, 'CLOUDFLARE_API_TOKEN'),
    ),
    preview[1],
  ];
  return {
    github,
    write,
    groups: [[repository], repositoryConfiguration, deploymentConfiguration],
  };
}

export async function provisionResourceGroups(root: string, target: Target) {
  const environment = `repos/${target.repository}/environments/${encodeURIComponent(target.environment)}`;
  const environmentVariables = `${environment}/variables`;
  const token = cloudflareCredential(root);
  const cloudflare = cloudflareReader(token);
  const account = `accounts/${target.accountId}`;
  const domains = `${account}/workers/domains?hostname=${encodeURIComponent(target.hostname)}`;
  const analytics = `${account}/rum/site_info/list`;
  const routes = `zones/${target.zoneId}/workers/routes`;
  const workerScripts = `${account}/workers/scripts`;
  const labs = await discoverLabs(root);
  const workers = labs
    .filter((lab) => lab.status !== 'draft')
    .map((lab) => ({ slug: lab.slug, name: `lvbt-labs-${lab.slug}` }));
  const cloudflareWrite = cloudflareWriter(token);
  const ruleset: unknown = JSON.parse(
    await readFile(path.join(root, '.lvbt/web-platform/standards/ruleset.json'), 'utf8'),
  );
  const githubResources = githubResourceGroups(root, target, ruleset);
  const workerResources = await provisionWorkerResources(root, labs, () =>
    cloudflare.list(workerScripts),
  );
  const workerPreviewResources = provisionWorkerPreviewResources(
    labs,
    (worker) => cloudflare.get(`${workerScripts}/${worker}/subdomain`),
    (worker, body) => cloudflareWrite('POST', `${workerScripts}/${worker}/subdomain`, body),
  );
  const routingResources = [
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
  ];
  const analyticsResources = provisionAnalytics(target, {
    readSites: () => cloudflare.list(analytics),
    createSite: (body) => cloudflareWrite('POST', `${account}/rum/site_info`, body),
    readVariables: () => githubResources.github(environmentVariables),
    writeVariable: (method, endpoint, body) => {
      if (
        endpoint !==
        (method === 'POST'
          ? environmentVariables
          : `${environmentVariables}/CLOUDFLARE_WEB_ANALYTICS_TOKEN`)
      )
        throw new Error('Analytics variable write is outside the declared target.');
      return githubResources.write(method, endpoint, body);
    },
  });
  return [
    ...githubResources.groups.slice(0, 2),
    workerResources,
    workerPreviewResources,
    routingResources,
    analyticsResources,
    ...githubResources.groups.slice(2),
  ];
}
