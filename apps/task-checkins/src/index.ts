import { handleDiscordRequest } from './discord/request';
import { handleManualTaskUpdate } from './jobs/notion-task-manual';
import { runTaskSchedule } from './jobs/scheduled';
export * from './jobs/notion-task-checkins';
export * from './jobs/discord-work';

export default {
  async fetch(request, env, context) {
    const url = new URL(request.url);
    if (url.hostname === 'jobs.internal' && url.pathname === '/notion/task-update')
      return handleManualTaskUpdate(request, env);
    if (request.method !== 'POST' || url.pathname !== '/platform/discord/interactions')
      return new Response(null, { status: 404 });
    return handleDiscordRequest(request, env, context);
  },
  async scheduled(_event, env, context) {
    await runTaskSchedule(env, context);
  },
} satisfies ExportedHandler<Env>;
