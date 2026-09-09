import { execFileSync } from 'node:child_process';

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

export function optionalGitHubRead(root: string, endpoint: string) {
  if (!/^repos\/[A-Za-z0-9-]+\/[A-Za-z0-9._-]+(?:\/|$)/.test(endpoint) || endpoint.includes('..'))
    return Promise.reject(new Error('GitHub reads require a repository API path.'));
  try {
    const output = execFileSync('gh', ['api', '--hostname', 'github.com', endpoint], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 30000,
    });
    return Promise.resolve(JSON.parse(output) as unknown);
  } catch (error) {
    const stderr =
      typeof error === 'object' && error !== null && 'stderr' in error ? String(error.stderr) : '';
    if (stderr.includes('HTTP 404')) return Promise.resolve(null);
    return Promise.reject(new Error('GitHub environment read was not confirmed.'));
  }
}
