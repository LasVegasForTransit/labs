import assert from 'node:assert/strict';
import test from 'node:test';
import { runTaskSchedule } from '../../src/jobs/scheduled';

void test('disabled automation does not open the database or invoke a background worker', async () => {
  const env = {
    LVBT_TASK_CHECKINS_ENABLED: 'false',
    LVBT_TASK_UPDATES_ENABLED: 'false',
    LVBT_DISCORD_WORK_ENABLED: 'false',
    get PLATFORM_DB() {
      return assert.fail('disabled worker must not open the database');
    },
  } as unknown as Env;
  await runTaskSchedule(env, {} as ExecutionContext);
});
