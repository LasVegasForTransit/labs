import { execFileSync } from 'node:child_process';
import { afterEach, expect, test, vi } from 'vitest';
import { githubPreviewReader, optionalGitHubRead } from '../src/github-preview-read.js';

vi.mock('node:child_process', () => ({ execFileSync: vi.fn() }));

const mockedExecFileSync = vi.mocked(execFileSync);

afterEach(() => {
  mockedExecFileSync.mockReset();
});

test('models a missing preview environment without hiding unrelated provider failures', async () => {
  const preview = 'repos/example/labs/environments/preview';
  const calls: string[] = [];
  const read = githubPreviewReader(
    preview,
    (endpoint) => {
      calls.push(`required:${endpoint}`);
      return Promise.resolve({ required: true });
    },
    (endpoint) => {
      calls.push(`optional:${endpoint}`);
      return Promise.resolve(null);
    },
  );

  await expect(read('repos/example/labs')).resolves.toEqual({ required: true });
  await expect(read(preview)).resolves.toBeNull();
  await expect(read(`${preview}/secrets`)).resolves.toEqual({ secrets: [] });
  expect(calls).toEqual([
    'required:repos/example/labs',
    `optional:${preview}`,
    `optional:${preview}/secrets`,
  ]);
});

test('reads a ruleset list across more than one page before deciding a ruleset is absent', async () => {
  // A repository with more than one page of rulesets used to truncate to the
  // first page, so an existing ruleset on a later page looked absent and the
  // vendored provisioner would POST a duplicate instead of updating it.
  const fillerRulesets = Array.from({ length: 35 }, (_, index) => ({
    id: index + 1,
    name: `filler-${index + 1}`,
    target: 'branch',
    source_type: 'Repository',
  }));
  const pinnedRuleset = {
    id: 36,
    name: 'org-standard',
    target: 'branch',
    source_type: 'Repository',
  };
  // `gh api --paginate --slurp` prints an array of pages; a list endpoint's
  // page is itself an array.
  mockedExecFileSync.mockReturnValue(JSON.stringify([fillerRulesets, [pinnedRuleset]]));

  const result = await optionalGitHubRead('/repo', 'repos/example/labs/rulesets');

  expect(result).toEqual([...fillerRulesets, pinnedRuleset]);
  expect(mockedExecFileSync).toHaveBeenCalledWith(
    'gh',
    [
      'api',
      '--hostname',
      'github.com',
      '--method',
      'GET',
      '--paginate',
      '--slurp',
      'repos/example/labs/rulesets',
    ],
    expect.objectContaining({ cwd: '/repo' }),
  );
});

test('merges a paginated secrets list instead of returning only its first page', async () => {
  const pageOne = { total_count: 2, secrets: [{ name: 'FIRST' }] };
  const pageTwo = { total_count: 2, secrets: [{ name: 'SECOND' }] };
  mockedExecFileSync.mockReturnValue(JSON.stringify([pageOne, pageTwo]));

  const result = await optionalGitHubRead(
    '/repo',
    'repos/example/labs/environments/preview/secrets',
  );

  expect(result).toEqual({
    total_count: 2,
    secrets: [{ name: 'FIRST' }, { name: 'SECOND' }],
  });
});

test('still resolves a missing resource to null on a 404, even while paginating', async () => {
  mockedExecFileSync.mockImplementation(() => {
    const error = new Error('exit status 1') as Error & { stderr: string };
    error.stderr = 'gh: Not Found (HTTP 404)';
    throw error;
  });

  await expect(
    optionalGitHubRead('/repo', 'repos/example/labs/environments/preview'),
  ).resolves.toBeNull();
});
