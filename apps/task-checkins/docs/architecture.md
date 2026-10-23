# Architecture

## Ownership

`apps/task-checkins` owns the bot's Notion task and project workflows. Product behavior stays inside
this application. `src/core` contains domain policy and messages, `src/storage` contains database
operations, and `src/integrations` contains Notion and Discord adapters. `src/discord` handles
signed interaction callbacks; `src/jobs` contains bounded background operations.

The member platform owns canonical people, verified external identities, membership, and staff
roles. The application binds to the existing environment-specific member database rather than
creating a second directory. Reads and mutations retain the existing authority checks. The
`MEMBER_PLATFORM` service binding delegates the bot's `/link` command to the canonical account-link
flow. Existing bot application and Discord message identifiers survive the move.

## Human actions and automation

Discord requests must have a valid, recent Ed25519 signature. Every action resolves a canonical
person, verifies the linked task and current Notion access, and records a durable operation before
provider writes. Duplicate interactions reuse that receipt. A manual action continues directly in
the Worker and refreshes its existing card after saving the current Notion snapshot.

`LVBT_TASK_UPDATES_ENABLED` controls manual updates independently of `LVBT_TASK_CHECKINS_ENABLED`,
which controls automated reminders, digests, and escalation. A stopped reminder worker cannot
consume pending deliveries through the manual operation path. `LVBT_DISCORD_WORK_ENABLED`
independently controls shared project and task conversations.

Project homes identify where work belongs. Task conversations identify exactly which Notion task
receives an update. Automatic reply syncing is restricted to explicitly linked task threads; general
project conversation requires a selected update. Audience, authorization, and destination changes
stop affected work for review. Sync preserves human attribution and durable source markers for
reconciliation without duplicating uncertain provider writes.

## Data and migration boundaries

The application owns migrations `0054_notion_task_checkins.sql` and `0055_discord_work_links.sql`.
They extend the member platform schema and retain its foreign keys. Earlier member-schema SQL under
`tests/storage/support/member-schema` exists only to exercise those contracts in an isolated SQLite
database. It must never be used to initialize or overwrite a live member database from this
application.

The archive is inert. Provider secrets remain Worker secrets. Configuration starts with every
feature switch false, no cron trigger, no workers.dev exposure, and a preview database binding.
