# Deploy and roll back

Production deployment follows a validated merge. Local credentials are not part of the normal
release path.

## Deploy

Merge the reviewed branch after `Validate` succeeds. Follow the production workflow and confirm that
its affected graph matches the change.

The workflow performs four gates:

1. Build every affected production and archive artifact.
2. Upload project Workers and record their version IDs.
3. Verify each exact path and subtree.
4. Upload home after every catalog target responds successfully.

After completion, run:

```sh
pnpm lab status <slug>
pnpm lab doctor <slug>
```

The deployment is accepted when the GitHub run, Worker version, route owner, public response,
assets, headers, and browser smoke test agree on the source commit.

## Roll back one project

List retained versions:

```sh
pnpm lab status <slug> --json
```

Select the last verified version and inspect the operation:

```sh
pnpm lab rollback <slug> --version <version-id> --dry-run
pnpm lab rollback <slug> --version <version-id> --apply
```

The rollback changes one Worker, then repeats route and browser smoke checks. Home remains untouched
unless its own output caused the incident.

## Roll back home

Roll back `home` when the catalog, archive, unknown-path handling, or hostname fallback is broken. A
failed project route belongs to that project's Worker, even when a visitor reached it through home.

## Data boundaries

Worker rollback does not reverse D1 migrations, KV writes, R2 objects, Durable Object state, or
third-party actions. A project with persistent data includes a project runbook that names its
restore point, migration compatibility window, and verification query.
