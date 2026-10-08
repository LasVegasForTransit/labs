# Deploy and roll back

Production publication selects a retained staging release. Local builds and provider version IDs
alone are not publication inputs.

## Deploy

Merge after `Validate` succeeds, then inspect **Stage Labs release**. Main stages home; select
another declared profile manually when needed. Follow [Stage and promote a Labs release](promote.md)
to promote the exact verified saved artifact through **Promote Labs release** or:

```sh
pnpm promote --app <slug> --run-id <staging-run-id>
```

After completion, run `pnpm lab status <slug>` and `pnpm lab doctor <slug>`, then exercise the
project's primary browser workflow. Acceptance requires the source run, saved artifact, Worker
version, route owner, public marker, HTTP checks and browser behavior to agree.

## Roll back one project

Choose the previous successful staging run whose artifact remains retained. Read the currently
active configured Worker version without changing it:

```sh
pnpm exec wrangler deployments list --name lvbt-labs-<slug> --json
```

Inspect the product policy and recovery request:

```sh
pnpm lab rollback <slug> \
  --run-id <retained-staging-run-id> \
  --expected-version <currently-active-version> \
  --commit <full-source-commit-of-selected-run> \
  --reason "Restore working route labels" \
  --dry-run --json
```

Dry run validates input and current product ownership without dispatching. Replace `--dry-run` with
`--apply` after review. The adapter verifies the selected run's source commit and delegates to
shared promotion. Shared publication revalidates retained source, bytes, profile, acceptance and
current production version before production writes. The expected version is an optimistic
precondition; it cannot prevent an unrelated provider actor from racing after the check.

Draft, graduated and handed-off profiles cannot bypass ownership through rollback. A retired lab
requires its declared ASSETS-only archive profile and verified captured bytes at both retained and
current source. A provider version alone cannot reconstruct a missing saved artifact.

The incident journal under `.wrangler/retained-publications/` records preparation and the shared
command result. `changed: null` means the outcome is unconfirmed. Reconcile the unique workflow run
and provider state before taking further action; do not blindly dispatch again.

## Roll back home

Select `home` when the catalog, archive navigation, unknown paths or hostname fallback caused the
incident. A project's route remains the responsibility of that project's Worker.

## Data boundaries

Worker recovery does not reverse D1 migrations, KV writes, R2 objects, Durable Object state or
third-party actions. Each stateful project documents its restore point, additive migration window
and verification queries. Browser acceptance is still required after recovery.
