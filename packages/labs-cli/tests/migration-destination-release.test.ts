import { cpSync } from 'node:fs';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, test, vi } from 'vitest';
import {
  createReleaseAttestation,
  sealSavedRelease,
} from '@lasvegasfortransit/web-platform/release';
import { destinationArtifact } from '../src/migration-destination-release.js';

const roots: string[] = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
const identity = { app: 'example', commit: 'a'.repeat(40), releaseId: '123' };
const handoff = {
  formatVersion: 1 as const,
  slug: 'example',
  repository: 'Example/standalone',
  sourceCommit: 'b'.repeat(40),
  destinationCommit: identity.commit,
  previousVersion: '11111111-1111-4111-8111-111111111111',
  phase: 'labs-paused' as const,
};
const signerCommit = '3567f0cb1345e8756eb5d84e0a3ea7b62695125a';

async function fixture(mode: 'valid' | 'tamper' | 'foreign') {
  const root = await mkdtemp(path.join(os.tmpdir(), 'destination-artifact-'));
  roots.push(root);
  const saved = path.join(root, 'saved');
  const proof = path.join(root, 'proof');
  await mkdir(path.join(saved, '.wrangler/worker'), { recursive: true });
  await writeFile(
    path.join(saved, '.wrangler/worker/index.js'),
    'export default {fetch(){return new Response("ok")}}',
  );
  await writeFile(
    path.join(saved, 'wrangler.jsonc'),
    JSON.stringify({
      name: 'lvbt-labs-example',
      env: { preview: { name: 'lvbt-labs-example-staging' } },
    }),
  );
  const release = await sealSavedRelease(saved, identity, 'worker', 2);
  await createReleaseAttestation(saved, proof);
  await writeFile(path.join(proof, 'bundle.jsonl'), '{}\n');
  if (mode === 'tamper') await writeFile(path.join(saved, '.wrangler/worker/index.js'), 'changed');
  const capture = path.join(root, 'command.json');
  const bin = path.join(root, 'bin');
  await mkdir(bin);
  await writeFile(
    path.join(bin, 'gh'),
    '#!/usr/bin/env node\nrequire("node:fs").writeFileSync(process.env.DESTINATION_SIGNATURE_CAPTURE,JSON.stringify(process.argv.slice(2)));\n',
  );
  await chmod(path.join(bin, 'gh'), 0o755);
  vi.stubEnv('PATH', `${bin}${path.delimiter}${process.env.PATH}`);
  vi.stubEnv('DESTINATION_SIGNATURE_CAPTURE', capture);
  const commands: string[][] = [];
  const github = (args: string[]) => {
    commands.push(args);
    if (args[0] === 'run') {
      const destination = args.at(-1);
      if (!destination) throw new Error('Missing artifact destination');
      cpSync(args.includes('app-release-123') ? saved : proof, destination, { recursive: true });
      return '';
    }
    if (args[1]?.endsWith('/artifacts'))
      return JSON.stringify({ artifacts: [{ name: 'app-release-123', expired: false }] });
    if (args[1]?.includes('/contents/'))
      return JSON.stringify({
        encoding: 'base64',
        content: Buffer.from(
          JSON.stringify({
            release: {
              attestation: {
                signerWorkflow:
                  'LasVegasForTransit/repository-tooling/.github/workflows/release-attest.yml',
                signerCommit,
              },
            },
          }),
        ).toString('base64'),
      });
    return JSON.stringify({
      id: 123,
      run_attempt: 1,
      name: 'Deploy staging',
      path: '.github/workflows/deploy.yml',
      event: 'push',
      head_branch: 'main',
      head_sha: mode === 'foreign' ? 'd'.repeat(40) : identity.commit,
      status: 'completed',
      conclusion: 'success',
      repository: { full_name: handoff.repository },
      head_repository: { full_name: handoff.repository },
    });
  };
  return { root, release, commands, capture, github };
}

test('destination proof verifies exact retained bytes and the signer at the reviewed destination commit', async () => {
  const f = await fixture('valid');
  await expect(destinationArtifact(handoff, identity, f.github)).resolves.toBe(
    f.release.artifactHash,
  );
  const args = JSON.parse(await readFile(f.capture, 'utf8')) as string[];
  expect(args).toContain('--signer-digest');
  expect(args).toContain(signerCommit);
  expect(args).toContain('--source-digest');
  expect(args).toContain(handoff.destinationCommit);
  expect(args).toContain('--deny-self-hosted-runners');
  expect(
    f.commands.every((args) => args[0] === 'api' || (args[0] === 'run' && args[1] === 'download')),
  ).toBe(true);
});
test.each(['tamper', 'foreign'] as const)(
  'destination %s cannot become a verified handoff',
  async (mode) => {
    const f = await fixture(mode);
    await expect(destinationArtifact(handoff, identity, f.github)).rejects.toThrow(
      /reviewed|source|artifact/,
    );
    await expect(readFile(f.capture, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    if (mode === 'foreign') expect(f.commands.some((args) => args[0] === 'run')).toBe(false);
  },
);
