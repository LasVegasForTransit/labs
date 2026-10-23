import { notionObject } from '../integrations/notion-task-types';
import { discordWorkInteraction } from './_work-links';
import { taskCheckinInteraction } from './_task-checkins';
import { readBody, signatureIsValid } from './signature';

function parseInteraction(body: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(body);
    return value && typeof value === 'object' && !Array.isArray(value) ? notionObject(value) : null;
  } catch {
    return null;
  }
}

async function dispatch(
  input: { request: Request; body: string },
  interaction: Record<string, unknown>,
  env: Env,
  context: ExecutionContext,
): Promise<Response> {
  if (interaction.type === 1) return Response.json({ type: 1 });
  const waitUntil = (p: Promise<unknown>) => context.waitUntil(p);
  const work = await discordWorkInteraction(
    { ...env, DISCORD_WORK: context.exports.WorkPreview },
    interaction,
    waitUntil,
  );
  if (work) return work;
  const task = await taskCheckinInteraction(env, interaction, waitUntil);
  if (task) return task;
  if (interaction.type !== 2 || notionObject(interaction.data).name !== 'link')
    return new Response(null, { status: 404 });
  const origin =
    env.LVBT_DEPLOYMENT_ENV === 'production'
      ? 'https://lasvegasfortransit.org'
      : 'https://preview.lasvegasfortransit.org';
  return env.MEMBER_PLATFORM.fetch(
    new Request(`${origin}/platform/discord/interactions`, {
      method: 'POST',
      headers: input.request.headers,
      body: input.body,
    }),
  );
}

export async function handleDiscordRequest(request: Request, env: Env, context: ExecutionContext) {
  const signature = request.headers.get('X-Signature-Ed25519');
  const timestamp = request.headers.get('X-Signature-Timestamp');
  if (!signature || !timestamp) return new Response(null, { status: 401 });
  if (!env.LVBT_DISCORD_PUBLIC_KEY) return new Response(null, { status: 503 });
  const body = await readBody(request);
  if (body === null) return new Response(null, { status: 413 });
  if (!(await signatureIsValid(body, signature, timestamp, env.LVBT_DISCORD_PUBLIC_KEY)))
    return new Response(null, { status: 401 });
  const interaction = parseInteraction(body);
  return interaction
    ? dispatch({ request, body }, interaction, env, context)
    : new Response(null, { status: 400 });
}
