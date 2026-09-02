# Working in this repository

Run `pnpm check` after every change. It is the same command CI runs, and a failing check names the
command that fixes it (`pnpm check:fix` repairs everything a machine can).

## Standard commands

Every LVBT repository answers to the same commands:

| Command               | What it does                                                    |
| --------------------- | --------------------------------------------------------------- |
| `pnpm bootstrap`      | Install dependencies, wire git hooks, and run preflight         |
| `pnpm preflight`      | Confirm the machine can build and deploy this repository        |
| `pnpm check`          | Format check, then lint, typecheck, and tests through Turborepo |
| `pnpm check:fix`      | Apply formatting and lint fixes                                 |
| `pnpm build`          | Build every package                                             |
| `pnpm test`           | Run every package's tests                                       |
| `pnpm run deploy`     | Build, then `wrangler deploy` every app (deployable repos)      |
| `turbo gen workspace` | Scaffold a new package or app                                   |

## Create GitHub issues and pull requests

Use the mandatory `github-contribution` skill from the `lvbt-contributions` plugin whenever a user
authorizes creating an issue or pull request. It carries the organization checklist, readable
templates, and the only approved creation helper:

```bash
node node_modules/@lvbt/cli/plugins/lvbt-contributions/scripts/github-create.mjs issue \
  --type bug|feature --title <title> --body-file <file>
node node_modules/@lvbt/cli/plugins/lvbt-contributions/scripts/github-create.mjs pr \
  --title <title> --body-file <file> --base main
```

Preview with `--dry-run --json` and inspect the complete Markdown before creating anything. Do not
call `gh issue create`, `gh pr create`, equivalent `gh api` routes, or connector creation tools
directly.

## Commit messages

Subjects are conventional: `type(scope): description`, at most 72 characters. Scopes are optional
and come only from [`.lvbt/commit-scopes.txt`](.lvbt/commit-scopes.txt). Omit the scope when a
change crosses boundaries; never invent one for a feature, file, task, or role.

## The repository standard

Lint, format, TypeScript, and test settings extend the `@lvbt/*` packages from
`LasVegasForTransit/repository-tooling`. Change a shared rule there, not here.

## Documentation ownership

- Platform, governance, security, and shared deployment material belongs under `docs/`.
- One lab's product and implementation material belongs under `apps/<slug>/docs/`.
- Project-specific rules travel with the project during graduation.
- [Documentation structure](docs/development/reference/documentation-structure.md) defines placement
  and style.

## Invariants

| Invariant                                                            | Reason                                                        | Enforcement                        |
| -------------------------------------------------------------------- | ------------------------------------------------------------- | ---------------------------------- |
| Applications never import other applications                         | Every project remains independently deployable and migratable | `pnpm check` boundary validation   |
| Shared packages contain brand and foundational UI only               | Product behavior remains under project ownership              | `pnpm check` dependency validation |
| Every published lab declares code, content, data, and asset licenses | MIT does not grant rights to unrelated material               | Manifest validation                |
| Public slugs survive every lifecycle transition                      | Existing links remain valid                                   | Route and catalog validation       |
| Root docs cover the platform; app docs cover one project             | Project knowledge remains portable                            | Structure and link checks          |
| Each document serves one Diátaxis purpose                            | Procedures, facts, teaching, and rationale remain distinct    | Documentation review               |

## Git safety

Preserve unrelated work and avoid destructive reset commands. Remote actions require explicit user
authorization. Commits require explicit approval and use the repository-local email
`willie@lasvegasfortransit.org`.
