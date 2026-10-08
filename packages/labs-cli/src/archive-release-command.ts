import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { readReleaseConfiguration } from '@lasvegasfortransit/web-platform/release';
import { z } from 'zod';
import { prepareArchiveRelease } from './archive-release.js';

const root = path.resolve(import.meta.dirname, '../../..');
const tooling = z
  .object({
    release: z.object({ apps: z.record(z.string(), z.object({ appDirectory: z.string() })) }),
  })
  .parse(JSON.parse(await readFile(path.join(root, '.lvbt/tooling.json'), 'utf8')));
for (const [app, profile] of Object.entries(tooling.release.apps)) {
  if (!profile.appDirectory.startsWith('.wrangler/archive-releases/')) continue;
  const config = await readReleaseConfiguration(root, process.env, app);
  await prepareArchiveRelease(root, app, config);
  process.stdout.write(
    `Prepared verified ASSETS-only archive release ${app}; no provider calls.\n`,
  );
}
