import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import {
  readReleaseConfiguration,
  runReleaseSmoke,
} from '@lasvegasfortransit/web-platform/release';

await runReleaseSmoke(
  await readReleaseConfiguration(fileURLToPath(new URL('../../../', import.meta.url))),
  chromium,
);
