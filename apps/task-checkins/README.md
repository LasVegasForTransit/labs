# Discord task updates

LVBT volunteers update Notion tasks from the existing Discord bot. Private task cards provide a
status dropdown and **Add update**. Project conversations can link to Notion projects, tasks, text
channels, threads, and forums. Human replies in an explicitly linked task thread become attributed
Notion comments; general conversation stays in Discord unless someone chooses **Save to Notion**.

This application owns the task workflow, provider integrations, storage, and background work. It
uses the canonical LVBT member database for verified Discord and Notion identities. It does not
create another bot, member directory, or staff dashboard.

## Development

Run `pnpm install` at the repository root, then
`pnpm --filter @lasvegasfortransit/lab-task-checkins build`. `pnpm check` validates the workspace.
`pnpm --filter @lasvegasfortransit/lab-task-checkins test:e2e` runs the signed Discord interaction,
Notion writeback, and existing-card refresh against local Workers with provider fixtures.

The app is a draft, unlisted backend. No public dashboard is needed: the working interface is
Discord. The Worker returns 404 for ordinary page requests. `build:archive` produces an inert page
without provider connections or write-capable bindings.

## Documentation

- [Architecture](docs/architecture.md)
- [Operate and migrate](docs/operate.md)

## Licenses

Code and the preview illustration are MIT. Documentation is CC BY 4.0. Private member and task data
remains private LVBT data and is not licensed for redistribution.
