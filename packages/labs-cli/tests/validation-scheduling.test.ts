import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { beforeAll, expect, test } from 'vitest';

interface PlannedTask {
  taskId: string;
  task: string;
  command: string;
  dependencies: string[];
  resolvedTaskDefinition: { cache: boolean };
}

let tasks: PlannedTask[];
beforeAll(async () => {
  const { stdout } = await promisify(execFile)(
    'pnpm',
    ['exec', 'turbo', 'run', 'lint', 'check-types', 'test', 'validate', '--dry=json'],
    { cwd: path.resolve(import.meta.dirname, '../../..'), timeout: 25_000 },
  );
  tasks = (JSON.parse(stdout) as { tasks: PlannedTask[] }).tasks;
}, 30_000);

function prerequisites(id: string, visiting = new Set<string>()): Set<string> {
  if (visiting.has(id)) throw new Error(`Validation dependency cycle at ${id}`);
  const task = tasks.find((item) => item.taskId === id);
  if (!task) throw new Error(`Missing planned task ${id}`);
  const result = new Set<string>();
  for (const dependency of task.dependencies) {
    result.add(dependency);
    for (const ancestor of prerequisites(dependency, new Set([...visiting, id])))
      result.add(ancestor);
  }
  return result;
}

test('required browser acceptance starts after preparation and runs one suite at a time', () => {
  const home = '@lasvegasfortransit/lab-home#validate';
  const funding = '@lasvegasfortransit/lab-transit-funding#validate';
  const cli = '@lasvegasfortransit/labs-cli#validate';
  const prepared = prerequisites(home);
  for (const task of tasks.filter(
    (item) =>
      ['lint', 'check-types', 'test'].includes(item.task) && item.command !== '<NONEXISTENT>',
  ))
    expect(prepared.has(task.taskId), `home browser must await ${task.taskId}`).toBe(true);
  expect(prerequisites(funding).has(home)).toBe(true);
  expect(prerequisites(cli).has(funding)).toBe(true);
  for (const id of [home, funding, cli, '//#security:dependencies', '//#security:secrets']) {
    expect(tasks.find((task) => task.taskId === id)?.resolvedTaskDefinition.cache).toBe(false);
    if (!id.startsWith('//#')) {
      expect(prerequisites(id).has('//#security:dependencies')).toBe(true);
      expect(prerequisites(id).has('//#security:secrets')).toBe(true);
    }
  }
});
