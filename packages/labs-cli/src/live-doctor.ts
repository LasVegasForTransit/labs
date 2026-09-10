import { z } from 'zod';

interface WorkerIdentity {
  slug: string;
  name: string;
}

export interface LiveCheck {
  id: string;
  requirement: string;
  status: 'pass' | 'fail' | 'unknown';
}

const releaseMarker = z
  .object({
    formatVersion: z.literal(1),
    slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    commit: z.string().regex(/^[a-f0-9]{40}$/),
    artifactHash: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();

const requiredHeaders = {
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
} as const;

async function check(
  id: string,
  requirement: string,
  inspect: () => Promise<boolean> | boolean,
): Promise<LiveCheck> {
  try {
    return { id, requirement, status: (await inspect()) ? 'pass' : 'fail' };
  } catch {
    return { id, requirement, status: 'unknown' };
  }
}

function validHeaders(response: Response) {
  return Object.entries(requiredHeaders).every(
    ([name, expected]) => response.headers.get(name) === expected,
  );
}

function validExactRoute(response: Response, origin: string, expectedPath: string) {
  if (response.status === 200) return true;
  if (![301, 302, 307, 308].includes(response.status)) return false;
  const location = response.headers.get('location');
  if (location === null) return false;
  const destination = new URL(location, origin);
  return destination.origin === origin && destination.pathname === expectedPath;
}

export async function liveDoctor(
  hostname: string,
  workers: WorkerIdentity[],
  request: typeof fetch = fetch,
): Promise<LiveCheck[]> {
  const origin = `https://${hostname}`;
  const responses = new Map<string, Promise<Response>>();
  const get = (pathname: string) => {
    const url = `${origin}${pathname}`;
    const existing = responses.get(url);
    if (existing !== undefined) return existing;
    const pending = request(url, {
      cache: 'no-store',
      redirect: 'manual',
      signal: AbortSignal.timeout(15000),
    });
    responses.set(url, pending);
    return pending;
  };

  const pages = workers.map((worker) => ({
    ...worker,
    path: worker.slug === 'home' ? '/' : `/${worker.slug}/`,
    marker: worker.slug === 'home' ? '/lvbt-release.json' : `/${worker.slug}/lvbt-release.json`,
  }));
  const markerResults = new Map(
    pages.map(({ slug, marker }) => [
      slug,
      get(marker).then(async (response) => {
        if (response.status !== 200) return false;
        try {
          const parsed = releaseMarker.safeParse(await response.json());
          return parsed.success && parsed.data.slug === slug;
        } catch {
          return false;
        }
      }),
    ]),
  );
  const routes = async () => {
    if ((await get('/not-a-lab')).status !== 404) return false;
    for (const page of pages) {
      if ((await get(page.path)).status !== 200 || !(await markerResults.get(page.slug)))
        return false;
      if (
        page.slug !== 'home' &&
        !validExactRoute(await get(`/${page.slug}`), origin, `/${page.slug}/`)
      )
        return false;
    }
    return true;
  };

  return Promise.all([
    check(
      'live.dns-tls',
      'The Labs hostname resolves over trusted TLS and serves home.',
      async () => (await get('/')).status === 200,
    ),
    check('live.headers', 'Public pages return the required security headers.', async () => {
      const publicPages = [...pages.map(({ path }) => path), '/not-a-lab'];
      return (await Promise.all(publicPages.map(get))).every(validHeaders);
    }),
    check(
      'live.release-markers',
      'Every published Worker serves its own valid release marker.',
      async () => (await Promise.all(markerResults.values())).every(Boolean),
    ),
    check(
      'live.routes',
      'Project routes override home and unknown paths resolve through home.',
      routes,
    ),
    check(
      'live.multi-worker',
      'Home and at least one project Worker pass live route verification.',
      async () => workers.length > 1 && (await routes()),
    ),
  ]);
}
