import type { InferEnv } from 'cf/config';
import type config from './cloudflare.config.js';

type Env = InferEnv<Awaited<ReturnType<typeof config>>['worker']>;

export async function fetchAssets(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === '/transit-funding' || url.pathname.startsWith('/transit-funding/'))
    url.pathname = url.pathname.slice('/transit-funding'.length) || '/';
  return env.ASSETS.fetch(new Request(url, request));
}

export default { fetch: fetchAssets };
