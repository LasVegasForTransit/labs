# Checks

One required GitHub check, `Validate`, is the acceptance bar for every LVBT repository. Local
commands expose its layers separately so contributors get fast, specific feedback.

## `pnpm check`

Runs without remote credentials, in this order, and stops at the first failing layer:

| Layer         | Coverage                                                                          |
| ------------- | --------------------------------------------------------------------------------- |
| Format        | Prettier across source, configuration, and docs                                   |
| Documentation | markdownlint, including that every relative link and anchor resolves              |
| Shape rules   | `lvbt check`: file naming, the package contract, and the suppression-debt ratchet |
| Lint          | ESLint with the organization baseline in every package                            |
| Types         | `astro check` for the Astro site, `tsc --noEmit` everywhere else                  |
| Unit tests    | Vitest in every package, including manifest and workspace validation              |

`pnpm check:fix` applies formatting and auto-fixable lint findings.

## Browser and build validation

`pnpm test:e2e` builds the labs, runs each lab's Playwright suite against its production artifact on
desktop and mobile profiles, then runs the shared preview navigation test. `pnpm build:archive`
produces the read-only archive of every lab.

## GitHub validation

`Validate` runs `pnpm check`, a dependency audit, and a secret scan on every pull request. The
`End-to-end` job runs `pnpm test:e2e`. The organization ruleset requires `Validate` on `main`;
merges use squash or rebase.
