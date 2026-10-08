import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { z } from 'zod';
import {
  packageTypedWorkerRelease,
  readReleaseConfiguration,
  verifyRelease,
} from '@lasvegasfortransit/web-platform/release';

const root = path.resolve(import.meta.dirname, '../../..');
const profiles = z
  .object({ release: z.object({ apps: z.record(z.string(), z.unknown()) }) })
  .parse(JSON.parse(await readFile(path.join(root, '.lvbt/tooling.json'), 'utf8'))).release.apps;
const temporary = await mkdtemp(path.join(os.tmpdir(), 'lvbt-labs-release-'));
try {
  for (const app of Object.keys(profiles)) {
    const config = await readReleaseConfiguration(root, process.env, app);
    const directory = path.join(temporary, app);
    const identity = { commit: '0000000000000000000000000000000000000000', releaseId: '1' };
    await packageTypedWorkerRelease(
      path.join(root, config.appDirectory),
      directory,
      identity,
      config,
    );
    const verified = await verifyRelease(directory);
    if (
      verified.commit !== identity.commit ||
      verified.releaseId !== identity.releaseId ||
      verified.app !== app
    )
      throw new Error('Saved artifact identity changed during local verification.');
    process.stdout.write(`PASS: packaged and verified ${app}; no provider calls.\n`);
  }
} finally {
  await rm(temporary, { recursive: true, force: true });
}
