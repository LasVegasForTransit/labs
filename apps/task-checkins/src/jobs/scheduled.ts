import { reserveScheduledWork, settleScheduledWork } from '../storage/query-budget';
import { emptyScheduledUsage } from './scheduled-budget';
import { runScheduledTaskCheckins } from './scheduled-task-checkins';
import { runScheduledDiscordWork } from './scheduled-discord-work';

/** Share the member database's daily budget; moving repos must not create another allowance. */
export async function runTaskSchedule(env: Env, context: ExecutionContext) {
  if (
    env.LVBT_TASK_CHECKINS_ENABLED !== 'true' &&
    env.LVBT_TASK_UPDATES_ENABLED !== 'true' &&
    env.LVBT_DISCORD_WORK_ENABLED !== 'true'
  )
    return;
  const lease = await reserveScheduledWork(
    env.PLATFORM_DB,
    env.LVBT_DEPLOYMENT_ENV,
    new Date(),
    crypto.randomUUID(),
  );
  if (!lease) return;
  const budget = {
    remaining: 14,
    deadline: Date.now() + 40_000,
    usage: emptyScheduledUsage(),
    controlReads: 0,
    controlWrites: 0,
  };
  let failed = true;
  try {
    const tasksFailed = await runScheduledTaskCheckins(context, budget);
    const workFailed = await runScheduledDiscordWork(context, budget);
    failed = tasksFailed || workFailed;
  } finally {
    await settleScheduledWork(env.PLATFORM_DB, lease, budget.usage, { failed, now: new Date() });
  }
}
