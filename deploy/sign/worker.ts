import type { InferEnv } from 'cf/config';
import type config from './cloudflare.config.js';

type Env = InferEnv<Awaited<ReturnType<typeof config>>['worker']>;

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
