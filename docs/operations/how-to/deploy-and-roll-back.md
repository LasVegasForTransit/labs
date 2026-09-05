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
pnpm exec wrangler deployments list --name lvbt-labs-<slug> --json
pnpm exec wrangler versions list --name lvbt-labs-<slug> --json
```

Select the last verified version and inspect the operation:

```sh
pnpm lab rollback <slug> \
  --version <version-to-restore> \
  --expected-version <currently-active-version> \
  --commit <full-source-commit-to-restore> \
  --reason "Restore working route labels" \
  --dry-run --json
```

Use the source commit from the selected version's verified deployment record. Targets require
standard version provenance; versions without it are rejected before activation. Archive targets
also carry their captured content hash, so retirement cannot roll back into active application code.
Omit flags in a terminal to enter the values through guided prompts. Dry runs inspect provider state
without changing deployments or writing a journal.

Replace `--dry-run` with `--apply` after reviewing the target. Applying requires a clean checkout of
current remote `main`. The command rechecks the active version before activation, directs all
traffic to the selected version, and verifies both the public release marker and project page.
Retired labs reject rollback targets with bindings other than static assets. Secret
incompatibilities stop the operation; rollback never forces a changed-secret override.

The journal under `.wrangler/rollbacks/` records preparation, activation, and verification. A failed
command with `changed: null` means the provider outcome is unconfirmed, not that nothing happened.
Inspect the active deployment before retrying. An identical retry verifies the already-restored
version without activating it again.

Exercise the restored project's primary workflow in a browser before closing the incident. HTTP and
release-marker checks do not establish application behavior or data compatibility. Home remains
untouched unless its own output caused the incident.

## Roll back home

Roll back `home` when the catalog, archive, unknown-path handling, or hostname fallback is broken. A
failed project route belongs to that project's Worker, even when a visitor reached it through home.

## Data boundaries

Worker rollback does not reverse D1 migrations, KV writes, R2 objects, Durable Object state, or
third-party actions. A project with persistent data includes a project runbook that names its
restore point, migration compatibility window, and verification query.
