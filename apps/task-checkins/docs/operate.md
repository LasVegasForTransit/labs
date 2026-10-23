# Operate and migrate

## Prerequisites

Use the existing LVBT Discord application and Notion connection. The selected environment needs its
canonical member database through member schema migration `0053`, verified person mappings, active
source consent, and the task and project migrations. Back up that database through the member
platform's supported backup workflow before schema changes. Never apply the fixture schema to a live
database.

Configure `LVBT_DEPLOYMENT_ENV`, `LVBT_DISCORD_APPLICATION_ID`, `LVBT_DISCORD_GUILD_ID`,
`LVBT_DISCORD_PRODUCTION_GUILD_ID`, `LVBT_NOTION_TASK_SOURCE_ID`, and
`LVBT_NOTION_TASK_PRODUCTION_SOURCE_ID` for the intended environment. Preview must select a
different guild and task source from production. Bind `PLATFORM_DB` to the same canonical database
and `MEMBER_PLATFORM` to its matching website Worker. Store `LVBT_DISCORD_PUBLIC_KEY`,
`LVBT_DISCORD_BOT_TOKEN`, and `LVBT_NOTION_TASK_API_KEY` as secrets, never in committed
configuration.

## Move an existing installation

1. Deploy the Labs Worker with all feature switches false and no cron triggers. Keep the existing
   website and jobs releases available for rollback. This application does not change them when
   built or checked.
2. Verify the Labs callback accepts a signed Discord ping at `/platform/discord/interactions`,
   rejects invalid signatures, and delegates `/link` to the existing member platform. Reuse the
   current application instead of registering a bot.
3. Stop the old task and project schedulers before changing the existing bot's interaction endpoint
   to the Labs callback. Reuse the same database, source, consent, and existing card records.
4. To retain manual controls with automated sending off, set `LVBT_TASK_UPDATES_ENABLED=true`, keep
   `LVBT_TASK_CHECKINS_ENABLED=false` and `LVBT_DISCORD_WORK_ENABLED=false`, and leave cron triggers
   empty. Submit one test note and verify its attributed Notion comment and same-card refresh.
5. Enable automatic reminders or shared conversations only after separate authorization. Ensure
   there is one active task scheduler, never the old and new scheduler together. Scheduled work uses
   bounded invocations and database budgets; provider failures remain queued for recovery.

## Recover

To stop all task updates, set all three switches false and remove cron triggers. To stop automated
sending while retaining manual controls, leave only `LVBT_TASK_UPDATES_ENABLED=true`. Read the live
bindings back before declaring sending disabled.

If cutover fails, stop the Labs scheduler and restore the previous Discord interaction endpoint and
reviewed website/jobs releases. Keep task tables and operation receipts: they prevent duplicate
writes and preserve existing card identity. An uncertain Notion write must be reconciled using its
source marker before retrying; never delete its receipt to force a resend.
