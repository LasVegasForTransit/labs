import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { chromium, webkit } from '@playwright/test';

const missing = [
  ['chromium', chromium],
  ['webkit', webkit],
]
  .filter(([, browser]) => !existsSync(browser.executablePath()))
  .map(([name]) => name);
// The shared release runner installs Chromium; this app also validates Safari behavior.
if (missing.length) {
  const install = spawnSync('pnpm', ['exec', 'playwright', 'install', '--with-deps', ...missing], {
    stdio: 'inherit',
  });
  if (install.status !== 0) process.exit(install.status ?? 1);
}
const require = createRequire(import.meta.url);
const result = spawnSync(
  process.execPath,
  [require.resolve('@playwright/test/cli'), 'test', '--workers=2', ...process.argv.slice(2)],
  { stdio: 'inherit' },
);
process.exit(result.status ?? 1);
