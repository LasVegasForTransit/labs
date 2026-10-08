import { spawn } from 'node:child_process';
import path from 'node:path';

interface Result {
  status: number;
  stdout: string;
  stderr: string;
}
interface Dependencies {
  run?: (root: string, args: string[]) => Promise<Result>;
  interactive?: boolean;
}
function run(root: string, args: string[]): Promise<Result> {
  return new Promise((resolve, reject) => {
    const interactive = args[0] === 'bootstrap';
    const child = spawn(
      process.execPath,
      [path.join(root, '.lvbt/web-platform/packages/cli/src/cli.mjs'), ...args],
      {
        cwd: root,
        stdio: interactive ? 'inherit' : ['ignore', 'pipe', 'pipe'],
      },
    );
    let stdout = '',
      stderr = '';
    child.stdout?.on('data', (data: Buffer) => {
      stdout += data.toString();
    });
    child.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString();
    });
    child.once('error', reject);
    child.once('exit', (status) => resolve({ status: status ?? 1, stdout, stderr }));
  });
}

/** Only the shared platform standard owns setup; product commands do not provision independently. */
export async function runStandardPlatform(
  root: string,
  apply: boolean,
  dependencies: Dependencies = {},
) {
  if (apply && !(dependencies.interactive ?? process.stdin.isTTY))
    throw new Error(
      'Production setup requires a maintainer terminal; run pnpm bootstrap --production.',
    );
  const result = await (dependencies.run ?? run)(root, [
    apply ? 'bootstrap' : 'preflight',
    '--production',
  ]);
  return {
    ok: result.status === 0,
    changed: apply ? null : false,
    command: apply ? 'bootstrap --production' : 'preflight --production',
    report: result.stdout.trim(),
    diagnostics: result.stderr.trim(),
  };
}
