import { handleManualTaskUpdate } from '../jobs/notion-task-manual';
import { notionObject } from '../integrations/notion-task-types';
import type { Db } from '../storage/db';
import {
  taskCheckinInteractionContext,
  type TaskCheckinRuntimeEnv,
} from '../integrations/notion-task-runtime';
import { handleTaskInteraction } from '../integrations/notion-task-interactions';

export interface TaskInteractionEnv extends TaskCheckinRuntimeEnv {
  PLATFORM_DB?: Db;
  LVBT_DISCORD_JOBS?: Pick<Fetcher, 'fetch'>;
}
export async function taskCheckinInteraction(
  env: Env & TaskInteractionEnv,
  interaction: unknown,
  waitUntil?: (promise: Promise<unknown>) => void,
): Promise<Response | null> {
  const context = taskCheckinInteractionContext(env);
  if (!context) return null;
  const response = await handleTaskInteraction(env.PLATFORM_DB, interaction, context);
  const event = notionObject(interaction);
  const custom = notionObject(event.data).custom_id;
  if (
    response?.ok &&
    waitUntil &&
    (event.type === 5 || (event.type === 3 && notionObject(event.data).component_type === 3)) &&
    typeof event.id === 'string' &&
    typeof custom === 'string' &&
    custom.startsWith('tc:')
  ) {
    const request = new Request('https://jobs.internal/notion/task-update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: event.id }),
    });
    const continuation = env.LVBT_DISCORD_JOBS
      ? env.LVBT_DISCORD_JOBS.fetch(request)
      : handleManualTaskUpdate(request, env);
    waitUntil(
      continuation
        .then(async (result) => {
          await result.body?.cancel();
        })
        .catch(() => undefined),
    );
  }
  return response;
}
