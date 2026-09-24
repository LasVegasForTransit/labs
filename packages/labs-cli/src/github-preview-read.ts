import { execFileSync } from 'node:child_process';
import { z } from 'zod';

type Read = (endpoint: string) => Promise<unknown>;

export function githubPreviewReader(
  previewEnvironment: string,
  read: Read,
  optionalRead: Read,
): Read {
  return async (endpoint) => {
    if (endpoint !== previewEnvironment && !endpoint.startsWith(`${previewEnvironment}/`))
      return read(endpoint);
    const result = await optionalRead(endpoint);
    if (result === null && endpoint === `${previewEnvironment}/secrets`) return { secrets: [] };
    return result;
  };
}

// Mirrors the pagination and page-flattening in the vendored githubReader
// (.lvbt/web-platform/packages/web-platform/src/github-read.ts) so a list
// endpoint with more than one page (rulesets, secrets, variables,
// branch policies, ...) is read completely before a provisioner decides a
// resource is absent. Unlike that reader, a 404 resolves to null instead of
// rejecting, because these endpoints are read before they are known to exist.
export function optionalGitHubRead(root: string, endpoint: string) {
  if (!/^repos\/[A-Za-z0-9-]+\/[A-Za-z0-9._-]+(?:\/|$)/.test(endpoint) || endpoint.includes('..'))
    return Promise.reject(new Error('GitHub reads require a repository API path.'));
  try {
    const output = execFileSync(
      'gh',
      ['api', '--hostname', 'github.com', '--method', 'GET', '--paginate', '--slurp', endpoint],
      {
        cwd: root,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 30000,
        maxBuffer: 16 * 1024 * 1024,
      },
    );
    const pages = z.array(z.unknown()).min(1).parse(JSON.parse(output));
    if (pages.length === 1) return Promise.resolve(pages[0]);
    if (pages.every(Array.isArray)) return Promise.resolve(pages.flat());
    const records = z.array(z.record(z.string(), z.unknown())).parse(pages);
    const first = { ...records[0] };
    for (const key of ['variables', 'secrets', 'branch_policies'])
      if (key in first)
        first[key] = records.flatMap((record) => z.array(z.unknown()).parse(record[key]));
    return Promise.resolve(first);
  } catch (error) {
    const stderr =
      typeof error === 'object' && error !== null && 'stderr' in error ? String(error.stderr) : '';
    if (stderr.includes('HTTP 404')) return Promise.resolve(null);
    return Promise.reject(new Error('GitHub read was not confirmed.'));
  }
}
