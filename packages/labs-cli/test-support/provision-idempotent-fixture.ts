import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, vi } from 'vitest';

// Shared setup for packages/labs-cli/tests/provision-idempotent.test.ts: a
// fixture repository root, a fake `gh`/`pnpm`/`wrangler` on PATH (see
// ./provision-idempotent-bin), and a stubbed Cloudflare Workers API plus a
// stubbed "live site", all backed by one JSON state file so every actor
// (subprocess or in-process fetch) sees the same provider state.

const FIXTURE_BIN = path.resolve(
  fileURLToPath(new URL('./provision-idempotent-bin', import.meta.url)),
);

export const REPOSITORY = 'example/labs-fixture';
export const ACCOUNT_ID = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
export const ZONE_ID = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
export const ZONE_NAME = 'example.org';
export const HOSTNAME = 'labs.example.org';

export interface FakeState {
  repository: string;
  branch: string;
  repo: Record<string, unknown> | null;
  rulesets: Array<Record<string, unknown> & { id: number }>;
  nextRulesetId: number;
  variables: Array<{ name: string; value: string }>;
  environments: Record<
    string,
    {
      deployment_branch_policy: {
        protected_branches: boolean;
        custom_branch_policies: boolean;
      } | null;
      can_admins_bypass: boolean;
      protection_rules: unknown[];
      branch_policies: Array<{ name: string; type: string }>;
      secrets: Array<{ name: string }>;
      variables: Array<{ name: string; value: string }>;
    }
  >;
  cloudflare: {
    zones: Record<string, unknown>;
    domains: Array<Record<string, unknown>>;
    routes: Array<{ id: string; pattern: string; script: string }>;
    workers: Array<{ id: string }>;
    subdomains: Record<string, { enabled: boolean; previews_enabled: boolean }>;
    analyticsSites: Array<{ host: string; site_tag: string; site_token: string }>;
  };
  _log: string[];
}

function initialState(): FakeState {
  return {
    repository: REPOSITORY,
    branch: 'main',
    repo: null,
    rulesets: [],
    nextRulesetId: 1,
    variables: [],
    environments: {},
    cloudflare: {
      zones: {
        [ZONE_ID]: {
          id: ZONE_ID,
          name: ZONE_NAME,
          account: { id: ACCOUNT_ID },
          status: 'active',
          paused: false,
        },
      },
      domains: [],
      routes: [],
      workers: [],
      subdomains: {},
      analyticsSites: [],
    },
    _log: [],
  };
}

function manifestSource(slug: string) {
  return `export default ${JSON.stringify({
    manifestVersion: 1,
    slug,
    title: slug,
    summary: `Fixture ${slug} lab for provisioning idempotency tests.`,
    kind: 'tool',
    profile: 'app',
    status: 'active',
    visibility: 'listed',
    maintainers: ['fixture-maintainer'],
    dates: { created: '2026-01-01', published: '2026-01-01' },
    previewImage: { path: 'public/preview.png', alt: 'Preview image.' },
    licenses: { code: 'MIT', content: 'MIT', data: 'MIT', assets: 'MIT' },
  })};\n`;
}

function infrastructureConfigSource() {
  return `export default ${JSON.stringify({
    repository: REPOSITORY,
    branch: 'main',
    environment: 'production',
    preview: {
      environment: 'preview',
      secret: 'CLOUDFLARE_PREVIEW_API_TOKEN',
      enabledVariable: 'CLOUDFLARE_PREVIEWS_ENABLED',
    },
    accountId: ACCOUNT_ID,
    zoneId: ZONE_ID,
    zoneName: ZONE_NAME,
    hostname: HOSTNAME,
  })};\n`;
}

function rulesetFixture() {
  return JSON.stringify(
    {
      name: 'org-standard',
      target: 'branch',
      enforcement: 'active',
      bypass_actors: [],
      conditions: { ref_name: { include: ['~DEFAULT_BRANCH'], exclude: [] } },
      rules: [{ type: 'deletion' }, { type: 'non_fast_forward' }],
    },
    null,
    2,
  );
}

async function writeFixtureRoot(root: string) {
  for (const slug of ['home', 'demo']) {
    const app = path.join(root, 'apps', slug);
    await mkdir(app, { recursive: true });
    await writeFile(path.join(app, 'lab.config.ts'), manifestSource(slug));
    await writeFile(path.join(app, 'wrangler.jsonc'), '{}\n');
  }
  await mkdir(path.join(root, '.lvbt/web-platform/standards'), { recursive: true });
  await writeFile(path.join(root, '.lvbt/infrastructure.config.ts'), infrastructureConfigSource());
  await writeFile(path.join(root, '.lvbt/web-platform/standards/ruleset.json'), rulesetFixture());
}

export async function loadState(stateFile: string): Promise<FakeState> {
  return JSON.parse(await readFile(stateFile, 'utf8')) as FakeState;
}

const REQUIRED_LIVE_HEADERS = {
  'referrer-policy': 'strict-origin-when-cross-origin',
  'x-content-type-options': 'nosniff',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
  'x-frame-options': 'DENY',
};

function liveResponse(pathname: string): Response {
  const headers = new Headers(REQUIRED_LIVE_HEADERS);
  if (pathname === '/') return new Response('home', { status: 200, headers });
  if (pathname === '/demo/') return new Response('demo', { status: 200, headers });
  if (pathname === '/not-a-lab') return new Response('missing', { status: 404, headers });
  if (pathname === '/demo')
    return new Response(null, { status: 308, headers: new Headers({ location: '/demo/' }) });
  if (pathname === '/lvbt-release.json')
    return Response.json({
      formatVersion: 1,
      slug: 'home',
      commit: 'a'.repeat(40),
      artifactHash: 'b'.repeat(64),
    });
  if (pathname === '/demo/lvbt-release.json')
    return Response.json({
      formatVersion: 1,
      slug: 'demo',
      commit: 'a'.repeat(40),
      artifactHash: 'b'.repeat(64),
    });
  return new Response(null, { status: 404 });
}

export interface FetchControl {
  failDomainOnce: boolean;
}

interface CloudflareRequest {
  method: string;
  pathname: string;
  url: URL;
  init: RequestInit | undefined;
}

interface CloudflareContext {
  state: FakeState;
  control: FetchControl;
  record: (entry: string) => void;
}

function envelope(result: unknown) {
  return Response.json({ success: true, result });
}

function unsuccessful() {
  return Response.json({ success: false, errors: [{ message: 'fixture-induced failure' }] });
}

function captured(match: RegExpExecArray, index: number): string {
  const value = match[index];
  if (value === undefined) throw new Error('Fixture regex is missing an expected capture group.');
  return value;
}

function parseBody(init: RequestInit | undefined): unknown {
  const body = init && typeof init.body === 'string' ? init.body : undefined;
  if (body === undefined) throw new Error('Fixture request is missing a JSON body.');
  return JSON.parse(body);
}

type CloudflareHandler = (
  request: CloudflareRequest,
  context: CloudflareContext,
) => Response | undefined;

function handleZone({ method, pathname }: CloudflareRequest, { state }: CloudflareContext) {
  const match = method === 'GET' ? /^zones\/([^/]+)$/.exec(pathname) : null;
  if (!match) return undefined;
  const zone = state.cloudflare.zones[captured(match, 1)];
  return zone ? envelope(zone) : new Response('not found', { status: 404 });
}

function handleDomainsList(
  { method, pathname, url }: CloudflareRequest,
  { state }: CloudflareContext,
) {
  if (method !== 'GET' || !/^accounts\/[^/]+\/workers\/domains/.test(pathname)) return undefined;
  const hostname = url.searchParams.get('hostname');
  return envelope(
    state.cloudflare.domains.filter((domain) => !hostname || domain.hostname === hostname),
  );
}

function handleDomainsPut(
  { method, pathname, init }: CloudflareRequest,
  context: CloudflareContext,
) {
  if (method !== 'PUT' || !/^accounts\/[^/]+\/workers\/domains$/.test(pathname)) return undefined;
  if (context.control.failDomainOnce) {
    context.control.failDomainOnce = false;
    return unsuccessful();
  }
  const body = parseBody(init) as Record<string, string>;
  const created = {
    id: `domain-${body.hostname}`,
    hostname: body.hostname,
    service: body.service,
    zone_id: body.zone_id,
    zone_name: body.zone_name,
    cert_id: `cert-${body.hostname}`,
  };
  const { domains } = context.state.cloudflare;
  const index = domains.findIndex((domain) => domain.hostname === body.hostname);
  if (index === -1) domains.push(created);
  else domains[index] = created;
  context.record(`PUT ${pathname}`);
  return envelope(created);
}

function handleRoutesList({ method, pathname }: CloudflareRequest, { state }: CloudflareContext) {
  if (method !== 'GET' || !/^zones\/[^/]+\/workers\/routes/.test(pathname)) return undefined;
  return envelope(state.cloudflare.routes);
}

function handleRoutesPost(
  { method, pathname, init }: CloudflareRequest,
  context: CloudflareContext,
) {
  if (method !== 'POST' || !/^zones\/[^/]+\/workers\/routes$/.test(pathname)) return undefined;
  const body = parseBody(init) as { pattern: string; script: string };
  const { routes } = context.state.cloudflare;
  const created = { id: `route-${routes.length + 1}`, pattern: body.pattern, script: body.script };
  routes.push(created);
  context.record(`POST ${pathname}`);
  return envelope(created);
}

function handleWorkersList({ method, pathname }: CloudflareRequest, { state }: CloudflareContext) {
  if (method !== 'GET' || !/^accounts\/[^/]+\/workers\/scripts$/.test(pathname)) return undefined;
  return envelope(state.cloudflare.workers);
}

function handleSubdomainGet({ method, pathname }: CloudflareRequest, { state }: CloudflareContext) {
  const match =
    method === 'GET'
      ? /^accounts\/[^/]+\/workers\/scripts\/([^/]+)\/subdomain$/.exec(pathname)
      : null;
  if (!match) return undefined;
  const settings = state.cloudflare.subdomains[captured(match, 1)] ?? {
    enabled: false,
    previews_enabled: false,
  };
  return envelope(settings);
}

function handleSubdomainPost(
  { method, pathname, init }: CloudflareRequest,
  context: CloudflareContext,
) {
  const match =
    method === 'POST'
      ? /^accounts\/[^/]+\/workers\/scripts\/([^/]+)\/subdomain$/.exec(pathname)
      : null;
  if (!match) return undefined;
  const name = captured(match, 1);
  const body = parseBody(init) as { enabled: boolean; previews_enabled: boolean };
  context.state.cloudflare.subdomains[name] = {
    enabled: body.enabled,
    previews_enabled: body.previews_enabled,
  };
  context.record(`POST ${pathname}`);
  return envelope(context.state.cloudflare.subdomains[name]);
}

function handleAnalyticsList(
  { method, pathname }: CloudflareRequest,
  { state }: CloudflareContext,
) {
  if (method !== 'GET' || !/^accounts\/[^/]+\/rum\/site_info\/list$/.test(pathname))
    return undefined;
  return envelope(state.cloudflare.analyticsSites);
}

function handleAnalyticsPost(
  { method, pathname, init }: CloudflareRequest,
  context: CloudflareContext,
) {
  if (method !== 'POST' || !/^accounts\/[^/]+\/rum\/site_info$/.test(pathname)) return undefined;
  const body = parseBody(init) as { host: string };
  const created = {
    host: body.host,
    site_tag: `site-${body.host}`,
    site_token: `token-${body.host}`,
  };
  context.state.cloudflare.analyticsSites.push(created);
  context.record(`POST ${pathname}`);
  return envelope(created);
}

const cloudflareHandlers: CloudflareHandler[] = [
  handleZone,
  handleDomainsList,
  handleDomainsPut,
  handleRoutesList,
  handleRoutesPost,
  handleWorkersList,
  handleSubdomainGet,
  handleSubdomainPost,
  handleAnalyticsList,
  handleAnalyticsPost,
];

function createFakeFetch(stateFile: string, control: FetchControl) {
  return async function fakeFetch(input: string | URL, init?: RequestInit): Promise<Response> {
    const url = new URL(input);
    if (url.hostname === HOSTNAME) return liveResponse(url.pathname);
    if (url.hostname !== 'api.cloudflare.com')
      throw new Error(`fake fetch: unexpected host ${url.hostname}`);

    const request: CloudflareRequest = {
      method: init?.method ?? 'GET',
      pathname: url.pathname.replace(/^\/client\/v4\//, ''),
      url,
      init,
    };
    const state = await loadState(stateFile);
    const context: CloudflareContext = {
      state,
      control,
      record: (entry) => state._log.push(entry),
    };

    for (const handler of cloudflareHandlers) {
      const response = handler(request, context);
      if (response) {
        if (request.method !== 'GET') await writeFile(stateFile, JSON.stringify(state));
        return response;
      }
    }
    throw new Error(`fake cloudflare: unhandled ${request.method} ${request.pathname}`);
  };
}

export interface ProvisionFixture {
  root: string;
  stateFile: string;
  control: FetchControl;
}

/**
 * Wires up beforeEach/afterEach for a fresh fixture repository, a fake
 * `gh`/`pnpm` on PATH, and a stubbed Cloudflare + live-site fetch. Call this
 * once at the top of a test file; the returned object's fields are populated
 * before each test runs.
 */
export function useProvisionFixture(): ProvisionFixture {
  const fixture = {
    root: '',
    stateFile: '',
    control: { failDomainOnce: false },
  } as ProvisionFixture;

  beforeEach(async () => {
    fixture.root = await mkdtemp(path.join(os.tmpdir(), 'lvbt-provision-idempotent-'));
    await writeFixtureRoot(fixture.root);
    fixture.stateFile = path.join(fixture.root, '.fake-state.json');
    await writeFile(fixture.stateFile, JSON.stringify(initialState()));
    fixture.control = { failDomainOnce: false };

    vi.stubEnv('PATH', `${FIXTURE_BIN}${path.delimiter}${process.env.PATH ?? ''}`);
    vi.stubEnv('FAKE_STATE_FILE', fixture.stateFile);
    vi.stubEnv('CLOUDFLARE_API_TOKEN', 'fixture-production-secret');
    vi.stubEnv('CLOUDFLARE_PREVIEW_API_TOKEN', 'fixture-preview-secret');
    vi.stubGlobal('fetch', createFakeFetch(fixture.stateFile, fixture.control));
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    await rm(fixture.root, { recursive: true, force: true });
  });

  return fixture;
}
