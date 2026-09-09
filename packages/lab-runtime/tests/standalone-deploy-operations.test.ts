import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from 'vitest';
import { deployStandalone, standaloneDeploymentOperations } from '../src/standalone-deploy.js';

test('the standalone adapter uploads and verifies the stable Labs route', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'lvbt-standalone-deploy-'));
  const commit = 'a'.repeat(40);
  const version = '22222222-2222-4222-8222-222222222222';
  const previous = '11111111-1111-4111-8111-111111111111';
  const commands: { args: string[]; cwd: string }[] = [];
  let uploaded = false;
  try {
    const app = path.join(root, 'apps/example');
    await mkdir(path.join(app, 'dist'), { recursive: true });
    await writeFile(path.join(app, 'dist/index.html'), '<h1>Example</h1>');
    const operations = standaloneDeploymentOperations(root, 'example', commit, {
      run: async (args, cwd, environment) => {
        commands.push({ args, cwd });
        if (args[0] === 'build') return '';
        if (args.includes('deployments'))
          return JSON.stringify([
            {
              created_on: '2026-09-01T00:00:00Z',
              versions: [{ version_id: uploaded ? version : previous, percentage: 100 }],
            },
          ]);
        if (args.includes('versions'))
          return JSON.stringify({
            id: version,
            annotations: { 'workers/message': `Commit ${commit}` },
          });
        const output = environment?.WRANGLER_OUTPUT_FILE_PATH;
        if (output !== undefined) {
          uploaded = true;
          await writeFile(
            output,
            `${JSON.stringify({
              type: 'deploy',
              version: 1,
              worker_name: 'lvbt-labs-example',
              version_id: version,
            })}\n`,
          );
        }
        return '';
      },
      fetch: async (input) => {
        const url =
          typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        if (url.includes('lvbt-release.json'))
          return new Response(await readFile(path.join(app, 'dist/example/lvbt-release.json')));
        return new Response('<h1>Example</h1>');
      },
      guard: () => undefined,
    });

    await expect(
      deployStandalone({ slug: 'example', commit, dryRun: false }, operations),
    ).resolves.toMatchObject({ ok: true, version, previousVersion: previous });
    expect(commands.some(({ args }) => args.includes('--strict'))).toBe(true);
    expect(commands.some(({ args }) => args.includes(`Commit ${commit}`))).toBe(true);
    expect(commands.some(({ args }) => args.includes('versions'))).toBe(true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
