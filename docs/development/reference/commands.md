# Command reference

Every LVBT repository answers to the same root commands; this repository adds `pnpm lab` for working
on one lab and `pnpm preview` for the shared catalog origin.

## Standard commands

| Command              | Purpose                                                                          |
| -------------------- | -------------------------------------------------------------------------------- |
| `pnpm bootstrap`     | `pnpm install`, wire git hooks, then `pnpm preflight`                            |
| `pnpm preflight`     | Confirm Node, pnpm, dependencies, hooks, scopes, GitHub CLI, and Cloudflare      |
| `pnpm check`         | Format, shape rules, lint, types, tests, browser/export acceptance, and security |
| `pnpm check:fix`     | Apply formatting and lint fixes                                                  |
| `pnpm build`         | Production build of every lab                                                    |
| `pnpm build:archive` | Read-only archive build of every lab into `dist-archive/`                        |
| `pnpm test:archive`  | Build archives and run declared browser suites with live services blocked        |
| `pnpm test`          | Unit tests for every package                                                     |
| `pnpm test:e2e`      | Browser tests for every lab, then the shared preview navigation test             |
| `pnpm run deploy`    | Dry-run build support; production requires retained `pnpm promote`               |

The full list, exit codes, and hooks are in the
[repository-tooling command reference](https://github.com/LasVegasForTransit/repository-tooling/blob/main/docs/reference/cli.md).

## `pnpm lab`

| Command                     | Behavior                                                                                   |
| --------------------------- | ------------------------------------------------------------------------------------------ |
| `pnpm lab create`           | Plan a draft lab using guided input, flags, or `--manifest <file>`; `--apply` writes files |
| `pnpm lab dev <slug>`       | Run the selected lab's development server                                                  |
| `pnpm lab preview <slug>`   | Serve the selected lab's production artifact                                               |
| `pnpm lab check <slug>`     | Run one lab's static analysis, tests, build, and browser acceptance                        |
| `pnpm lab status <slug>`    | Print the lab's validated manifest (`--json` for one line)                                 |
| `pnpm lab deprecate <slug>` | Preview deprecation metadata; `--apply` writes the manifest                                |
| `pnpm lab migrate <slug>`   | Prepare, provision, transfer, and verify a standalone project migration                    |
| `pnpm lab retire <slug>`    | Prepare, verify, and finalize a read-only retirement archive                               |

A slug identifies an app under `apps/` or a retired or graduated record at `catalog/<slug>.json`.
`status` reads both locations; development and preview commands require app source. Commands exit
with status 1 when an operation fails and status 2 when input or configuration is invalid. Duplicate
ownership between an app and a catalog record is invalid.

### Creation

`pnpm lab create` prompts for missing fields in an interactive terminal. `--json` requires complete
input and returns structured output without prompting. Creation is a dry run unless `--apply` is
present; `--apply` and `--dry-run` are mutually exclusive.

Provide either `--manifest <json-file>` or the individual fields below. These input forms cannot be
combined. New projects are draft and unlisted, and their code license is MIT.

| Flags                                                    | Values                                                                |
| -------------------------------------------------------- | --------------------------------------------------------------------- |
| `--slug`, `--title`, `--summary`                         | Permanent lowercase kebab-case slug, project name, and public summary |
| `--profile`                                              | `site` or `app`                                                       |
| `--kind`                                                 | `tool`, `visualization`, or `publication`                             |
| `--maintainers`                                          | Comma-separated GitHub usernames                                      |
| `--preview-image`, `--preview-alt`                       | Public image path and image description                               |
| `--content-license`, `--data-license`, `--asset-license` | Explicit license declarations                                         |
| `--created`                                              | Optional `YYYY-MM-DD` date; defaults to the current UTC date          |

### Deprecation

`pnpm lab deprecate <slug> --reason <text> --sunset YYYY-MM-DD` previews the change. Add `--apply`
to write it, or `--dry-run` to make the preview explicit. Both modes accept `--json`. The
interactive command prompts for missing slug, reason, and sunset values; JSON mode requires complete
flags and never prompts. Successor links require both `--successor <https-url>` and
`--successor-label <text>`.

Deprecation preserves the slug, visibility, publication date, and original deprecation date. Only
active and deprecated labs accept this transition; the home catalog does not. The sunset date cannot
precede deprecation. The command edits literal TypeScript manifests without executing them and
rejects computed fields rather than replacing project-owned logic. Run `pnpm format` and
`pnpm check` before committing the change.

### Migration

`pnpm lab migrate <slug> --prepare --repository <owner/name> --output <directory>` plans a
standalone export. Add `--apply` to create it. The exported repository carries the pinned standard,
project source, transitive shared packages, CI, deployment configuration, documentation, licenses,
and exact provenance.

`pnpm lab migrate <slug> --provision --repository <owner/name> --output <directory>` plans the
destination's public GitHub repository, initial `main` push, branch rules, production environment,
Cloudflare account and zone variables, disabled deployment-owner variable, and deploy token secret.
The standalone export must be validated, committed on `main`, clean, and tied to the current Labs
source commit. Add `--apply` to create or reconcile those resources. A new deploy token is read from
`CLOUDFLARE_API_TOKEN`; an existing secret remains in place on idempotent reruns. This phase does
not change the Labs Worker or route.

`pnpm lab migrate <slug> --pause --repository <owner/name> --source-commit <commit>` verifies the
destination's current main commit, required `Validate` result, disabled deployment-owner variable,
and the active Labs Worker version plus its verified retained release identity. Add `--apply` to
write `migrations/<slug>.json`. Once committed, that record excludes only the migrating slug from
Labs production deployment. Both phases support guided prompts, complete non-interactive flags,
`--dry-run`, and `--json`.

`pnpm lab migrate <slug> --transfer` rechecks the committed pause and the exact destination commit.
With `--apply`, it enables `LVBT_DEPLOYMENT_OWNER` and dispatches the destination deployment with
the reviewed commit as a required workflow input. The workflow refuses a newer branch commit.
Transfer operations are journaled before and after every remote mutation; an unconfirmed result
requires provider inspection before retry.

`pnpm lab migrate <slug> --verify` proves the destination still owns deployment, its reviewed commit
remains validated, the active Worker version names that commit, and the stable Labs marker and page
resolve correctly. Add `--apply` to replace the pause record with the exact verified version and
artifact hash. Graduation requires that committed verification record.

`pnpm lab migrate <slug> --finalize --graduated YYYY-MM-DD` repeats verification and plans the
graduated catalog record. Add `--apply` to move app source and the handoff into recoverable Git
storage and publish the metadata-only record in the working tree.

`pnpm lab migrate <slug> --rollback` plans recovery before graduation. Add `--apply` to disable the
destination owner, promote and verify the captured retained Labs staging release, and remove the
handoff record. Provider mutations and uncertain failures are journaled under
`.wrangler/migrations/`.

## Deployment planning

`pnpm deploy:plan --base <commit> --head <commit> --json` compares committed Git trees and prints
affected packages, apps, and deployment order. The head defaults to `HEAD`. Use `--all` instead of
`--base` for a full plan. The command does not build or deploy; `--dry-run` makes that intent
explicit and `--apply` is rejected.

Uncommitted edits are not part of a plan. Both revisions resolve to immutable commit IDs in the
output. Missing revisions and unreadable manifests fail the command instead of producing an empty
deployment. Historical manifests are parsed as literal TypeScript data, not executed.

Shared package changes include transitive dependents. Manifest and metadata changes also include
home. Active and deprecated apps enter the deployment list; drafts remain buildable without being
published. Home appears last. A removed package still invalidates surviving dependents through the
previous revision's dependency graph.

### Applying a deployment

`pnpm deploy:affected --base <commit> --run-id <staging-run-id> --apply --json` selects the planned
profiles and delegates each to shared retained promotion. Omit `--apply` for a read-only plan; use
`--all` instead of `--base` for a full plan. Apply requires a clean checkout of the planned commit
on current remote main and a retained run whose source equals that commit. It does not build or
invoke a second publisher. Children run before home; a failed child withholds home.

The shared engine verifies exact saved bytes and acceptance before publication. Product incident
journals under `.wrangler/retained-publications/` retain uncertain command outcomes. Reconcile the
unique shared workflow run before redispatching. One run must contain the selected profile's
artifact; use individual `pnpm promote --app <slug> --run-id <run>` requests for profiles from
different runs.

## `pnpm preview`

The repository preview runs at `http://127.0.0.1:8797`. It builds nothing itself: run `pnpm build`
first. It starts each lab as an independent Worker on an internal port, sends exact slug paths to
the owning lab, and sends every other path to home. Use it for catalog navigation, route ownership,
and cross-lab acceptance; `pnpm lab preview <slug>` is the faster isolated check.

## Required security checks

`pnpm check` always runs `pnpm security:dependencies` (all dependencies, high severity and above)
and `pnpm security:secrets` (the pinned shared full-history scanner). Both are uncached Turbo tasks
required by every product validation path. CI checks out full history and invokes the same command;
repository Gitleaks allowlists remain authoritative.
