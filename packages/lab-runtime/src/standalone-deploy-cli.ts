import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import {
  deployStandalone,
  standaloneDeploymentInput,
  standaloneDeploymentOperations,
} from './standalone-deploy.js';

export async function runStandaloneDeployment(root: string, args: string[]) {
  const input = standaloneDeploymentInput(args);
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
  }).trim();
  return deployStandalone(
    { ...input, commit },
    standaloneDeploymentOperations(root, input.slug, commit),
  );
}

const entry = process.argv[1];
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) {
  runStandaloneDeployment(process.cwd(), process.argv.slice(2))
    .then((result) => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`))
    .catch((error: unknown) => {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 1;
    });
}
