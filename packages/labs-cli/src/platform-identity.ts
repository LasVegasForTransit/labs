import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';

/** Product health and explicit migration provisioning share the platform's declared identity. */
export async function platformIdentity(root: string) {
  const manifest = z
    .object({
      cloudflare: z.object({
        accountId: z.string().regex(/^[a-f0-9]{32}$/),
        zone: z.object({ name: z.string(), id: z.string().regex(/^[a-f0-9]{32}$/) }),
        domains: z.array(z.string()).min(1),
      }),
    })
    .parse(JSON.parse(await readFile(path.join(root, 'platform.json'), 'utf8')));
  const hostname = manifest.cloudflare.domains[0];
  if (!hostname) throw new Error('The platform must declare its production hostname.');
  return {
    accountId: manifest.cloudflare.accountId,
    zoneId: manifest.cloudflare.zone.id,
    zoneName: manifest.cloudflare.zone.name,
    hostname,
  };
}
