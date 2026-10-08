import { appendFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import { deploymentPlan } from './deployment-plan.js';
import { selectLabReleases } from './release-policy.js';

interface Selection {
  action: string;
  base?: string;
  head?: string;
}
type Plan = (
  root: string,
  refs: { base?: string; head?: string },
) => { deploy: string[]; head: string };
/** Retains the product affected graph and lifecycle policy; shared execution owns uploads and cleanup. */
export async function selectLabPrReleases(
  root: string,
  input: Selection,
  plan: Plan = deploymentPlan,
) {
  const apps = z
    .record(
      z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u),
      z.object({ appDirectory: z.string().min(1), artifactPrefix: z.string().min(1) }),
    )
    .parse(
      (
        JSON.parse(await readFile(path.join(root, '.lvbt/tooling.json'), 'utf8')) as {
          release: { apps: unknown };
        }
      ).release.apps,
    );
  if (input.action === 'closed')
    return Object.entries(apps).map(([app, profile]) => ({
      ...profile,
      app,
      acceptanceDirectory: 'packages/labs-cli',
    }));
  const affected = plan(root, {
    ...(input.base ? { base: input.base } : {}),
    ...(input.head ? { head: input.head } : {}),
  });
  if (affected.deploy.some((app) => !Object.hasOwn(apps, app)))
    throw new Error('Every affected published lab needs a declared reviewed release profile.');
  const eligible = await selectLabReleases(root, { target: 'preview', event: 'pull_request' });
  return eligible.filter((profile) => affected.deploy.includes(profile.app));
}

async function main() {
  const { values } = parseArgs({
    options: { action: { type: 'string' }, base: { type: 'string' }, head: { type: 'string' } },
  });
  const apps = await selectLabPrReleases(process.cwd(), {
    action: values.action ?? '',
    ...(values.base ? { base: values.base } : {}),
    ...(values.head ? { head: values.head } : {}),
  });
  if (process.env.GITHUB_OUTPUT)
    await appendFile(
      process.env.GITHUB_OUTPUT,
      `matrix=${JSON.stringify(apps)}\nhas-previews=${apps.length > 0}\n`,
    );
  process.stdout.write(`${JSON.stringify({ apps })}\n`);
}
const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(entry).href) await main();
