import { parseArgs } from 'node:util';
import { reconcileResources, type ProvisionResource } from './provision-reconcile.js';

interface Check {
  id: string;
  status: 'pass' | 'fail' | 'unknown';
}

export function provisionInput(args: string[]) {
  const { values } = parseArgs({
    args,
    options: {
      apply: { type: 'boolean' },
      'dry-run': { type: 'boolean' },
      json: { type: 'boolean' },
    },
  });
  if (values.apply && values['dry-run']) throw new Error('Choose --apply or --dry-run, not both.');
  return { apply: values.apply === true, json: values.json === true };
}

export async function runProvision(
  apply: boolean,
  resources: ProvisionResource[],
  inspect: () => Promise<Check[]>,
) {
  const checks = await inspect();
  const required = [
    'github.repository',
    'github.rules',
    'cloudflare.zone',
    'cloudflare.domain',
    'cloudflare.workers',
  ];
  const blockedBy = required.filter(
    (id) => !checks.some((check) => check.id === id && check.status === 'pass'),
  );
  if (blockedBy.length > 0)
    return {
      command: 'provision',
      ok: false,
      changed: false,
      operations: [],
      blockedBy,
      remaining: checks.filter((check) => check.status !== 'pass'),
    };
  const result = await reconcileResources(resources, apply);
  const remaining = (apply ? await inspect() : checks).filter((check) => check.status !== 'pass');
  return {
    command: 'provision',
    ...result,
    ok: result.ok && remaining.length === 0,
    blockedBy,
    remaining,
  };
}

export async function provision(root: string, args: string[]) {
  const input = provisionInput(args);
  const { doctor } = await import('./doctor.js');
  const { provisionResources } = await import('./provision-providers.js');
  const initial = await doctor(root, []);
  let first = true;
  const inspect = async () => {
    if (first) {
      first = false;
      return initial.checks;
    }
    return (await doctor(root, [])).checks;
  };
  const resources = await provisionResources(root, initial.target);
  return {
    ...(await runProvision(input.apply, resources, inspect)),
    mode: input.apply ? 'apply' : 'dry-run',
    managed: ['github.variables', 'github.production', 'cloudflare.routes'],
    verificationRequired: initial.verificationRequired,
  };
}
