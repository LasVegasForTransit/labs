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

| Command                   | Behavior                                                   |
| ------------------------- | ---------------------------------------------------------- |
| `pnpm lab dev <slug>`     | Run the selected lab's development server                  |
| `pnpm lab preview <slug>` | Serve the selected lab's production artifact               |
| `pnpm lab status <slug>`  | Print the lab's validated manifest (`--json` for one line) |

A slug is the directory under `apps/`; the command validates `apps/<slug>/lab.config.ts` before it
runs anything and exits with status 2 on a usage error.

## `pnpm preview`

The repository preview runs at `http://127.0.0.1:8797`. It builds nothing itself: run `pnpm build`
first. It starts each lab as an independent Worker on an internal port, sends exact slug paths to
the owning lab, and sends every other path to home. Use it for catalog navigation, route ownership,
and cross-lab acceptance; `pnpm lab preview <slug>` is the faster isolated check.
