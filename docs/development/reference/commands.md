# Command reference

Every LVBT repository answers to the same root commands; this repository adds `pnpm lab` for working
on one lab and `pnpm preview` for the shared catalog origin.

## Standard commands

| Command              | Purpose                                                                     |
| -------------------- | --------------------------------------------------------------------------- |
| `pnpm bootstrap`     | `pnpm install`, wire git hooks, then `pnpm preflight`                       |
| `pnpm preflight`     | Confirm Node, pnpm, dependencies, hooks, scopes, GitHub CLI, and Cloudflare |
| `pnpm check`         | Format check, Markdown lint, shape rules, then lint, types, and unit tests  |
| `pnpm check:fix`     | Apply formatting and lint fixes                                             |
| `pnpm build`         | Production build of every lab                                               |
| `pnpm build:archive` | Read-only archive build of every lab into `dist-archive/`                   |
| `pnpm test`          | Unit tests for every package                                                |
| `pnpm test:e2e`      | Browser tests for every lab, then the shared preview navigation test        |
| `pnpm run deploy`    | Build, then `wrangler deploy` every lab with a wrangler config              |

The full list, exit codes, and hooks are in the
[repository-tooling command reference](https://github.com/LasVegasForTransit/repository-tooling/blob/main/docs/reference/cli.md).

## `pnpm lab`

| Command                     | Behavior                                                                                   |
| --------------------------- | ------------------------------------------------------------------------------------------ |
| `pnpm lab create`           | Plan a draft lab using guided input, flags, or `--manifest <file>`; `--apply` writes files |
| `pnpm lab dev <slug>`       | Run the selected lab's development server                                                  |
| `pnpm lab preview <slug>`   | Serve the selected lab's production artifact                                               |
| `pnpm lab status <slug>`    | Print the lab's validated manifest (`--json` for one line)                                 |
| `pnpm lab deprecate <slug>` | Preview deprecation metadata; `--apply` writes the manifest                                |

A slug is the directory under `apps/`; the command validates `apps/<slug>/lab.config.ts` before it
runs anything and exits with status 2 on a usage error.

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

`pnpm deploy:affected --base <commit> --apply --json` builds and deploys the plan. Omit `--apply`
for a preview, or use `--all` instead of `--base` for a full deployment. Apply requires a clean
checkout of the planned commit on main and runs `pnpm check` before building. The checkout must
match remote main. The command checks its commit and cleanliness again after building and
immediately before each upload; an unavailable remote or a newer commit stops deployment.

Each artifact contains `lvbt-release.json` with its project slug, source commit, and asset checksum.
Verification compares the stable URL's marker with the built artifact and confirms that Cloudflare's
active version matches the upload receipt. A page returning 200 by itself is not release acceptance.
The command refuses traffic-split deployments rather than recording an incomplete rollback target.

Deployment journals under `.wrangler/deployments/` record the previous version before upload and
retain unconfirmed uploads for inspection. Do not retry an unconfirmed upload blindly. Inspect the
journal and current Cloudflare deployment first. CI retains these journals as deployment-receipt
artifacts for 90 days. A successful immediately preceding run supplies the comparison commit. After
a failed, cancelled, uncertain, or retried run, CI deploys all published apps. Some apps can already
be live when another app fails, so comparing only against an older success misses reversions.

## `pnpm preview`

The repository preview runs at `http://127.0.0.1:8797`. It builds nothing itself: run `pnpm build`
first. It starts each lab as an independent Worker on an internal port, sends exact slug paths to
the owning lab, and sends every other path to home. Use it for catalog navigation, route ownership,
and cross-lab acceptance; `pnpm lab preview <slug>` is the faster isolated check.
