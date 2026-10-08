import path from 'node:path';
import {
  prPreviewConfiguration,
  readReleaseConfiguration,
  validateWorkerSmokeOrigin,
} from '@lasvegasfortransit/web-platform/release';
import { verifyPreviewBrowser } from './pr-preview-browser.js';
const root = path.resolve(import.meta.dirname, '../../..');
const config = prPreviewConfiguration(
  await readReleaseConfiguration(root),
  process.env.LVBT_PR_NUMBER ?? '',
);
const url = process.env.PLAYWRIGHT_BASE_URL;
if (!url || !config.profile)
  throw new Error('Select the uploaded PR candidate and reviewed Labs profile.');
validateWorkerSmokeOrigin(url, config, true);
await verifyPreviewBrowser({ slug: config.profile }, { url });
