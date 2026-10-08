import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, test } from 'vitest';
test('main stages through the shared workflow and production requires explicit retained promotion', async () => {
  const workflow = await readFile(
    path.resolve(import.meta.dirname, '../../../.github/workflows/deploy.yml'),
    'utf8',
  );
  expect(workflow).toContain('packages/labs-cli/src/release-policy-command.ts');
  expect(workflow).toMatch(
    /repository-tooling\/\.github\/workflows\/release-publish\.yml@[a-f0-9]{40}/,
  );
  expect(workflow).toContain('target: preview');
  expect(workflow).not.toContain('target: production');
  const promotion = await readFile(
    path.resolve(import.meta.dirname, '../../../.github/workflows/promote.yml'),
    'utf8',
  );
  expect(promotion).toMatch(/^ {2}workflow_dispatch:$/m);
  expect(promotion).not.toMatch(/^ {2}(push|schedule|pull_request):$/m);
  expect(promotion).toContain('target: production');
  expect(promotion).toContain('needs: [source, policy, handoff-policy]');
  expect(promotion).toContain("if: needs.policy.outputs.handoff == 'true'");
  expect(promotion).toContain("needs.handoff-policy.result == 'success'");
  const ordinary = promotion.slice(
    promotion.indexOf('  policy:'),
    promotion.indexOf('  handoff-policy:'),
  );
  expect(ordinary).not.toContain('environment: production');
  expect(ordinary).not.toContain('LVBT_MIGRATION_GITHUB_TOKEN');
  expect(promotion).toContain('--commit "$COMMIT"');
  expect(workflow).not.toContain('packages/labs-tooling');
});

test('every retained profile is signed before staging and production verifies the same immutable proof', async () => {
  const root = path.resolve(import.meta.dirname, '../../..');
  const staging = await readFile(path.join(root, '.github/workflows/deploy.yml'), 'utf8');
  const promotion = await readFile(path.join(root, '.github/workflows/promote.yml'), 'utf8');
  const tooling = JSON.parse(await readFile(path.join(root, '.lvbt/tooling.json'), 'utf8')) as {
    release: { attestation?: unknown };
  };
  expect(tooling.release.attestation).toMatchObject({
    signerWorkflow: 'LasVegasForTransit/repository-tooling/.github/workflows/release-attest.yml',
    signerCommit: '3567f0cb1345e8756eb5d84e0a3ea7b62695125a',
  });
  expect(staging).toContain('release-attest.yml@');
  expect(staging).toContain('needs: [policy, build, attest]');
  expect(staging).toContain('attestations: write');
  expect(staging).toContain('id-token: write');
  for (const workflow of [staging, promotion])
    expect(workflow).toContain('attestation-prefix: attestation-${{ matrix.artifactPrefix }}');
});
