# Operate TransitFunding

TransitFunding deploys as `lvbt-labs-transit-funding` and owns the exact `/transit-funding` route
plus its subtree. The Worker serves Vite assets and a health response; it has no persistent data.

## Deploy and verify

Production follows the repository deployment runbook. After the GitHub workflow succeeds, check the
project directly:

```sh
pnpm lab status transit-funding
pnpm lab doctor transit-funding
```

Browser verification loads the story at the base path, refreshes a nested asset request, changes
fiscal controls, checks citations, exercises reduced motion, and confirms
`/transit-funding/api/health` returns a successful JSON response.

## Roll back

List retained versions and restore the last verified release:

```sh
pnpm lab status transit-funding --json
pnpm lab rollback transit-funding --version <version-id> --apply
```

No database or application state requires restoration. Rollback changes the Worker code and static
asset bundle together.

## Retire

The archive build contains the fiscal model, source inventory, story, controls, and accessible chart
descriptions. Retirement verification denies all network requests and omits the health endpoint
before the artifact replaces the active Worker version.
