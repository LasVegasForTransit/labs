# Provision Labs

Provisioning reconciles GitHub, Cloudflare, DNS, routes, TLS, analytics, secrets, and variables from
repository state. Dashboard-only setup is drift, not an accepted installation step.

## Authenticate and inspect

Authenticate the local CLIs without placing credentials in shell arguments:

```sh
gh auth login
pnpm exec wrangler login
```

Set `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_PREVIEW_API_TOKEN` in the command environment before
applying changes. GitHub CLI reads both tokens from standard input; neither appears in a command
argument. The production token needs Workers Routes, Workers Scripts, Account Analytics, and Zone
DNS permissions for the configured account and zone. The preview token needs Worker Scripts access
without production routes, analytics, or application secrets.

Run a read-only comparison:

```sh
pnpm provision --dry-run
pnpm run doctor
```

The result names the GitHub organization and repository, Cloudflare account and zone, required
resources, existing identifiers, and every proposed change. Stop when either command selects an
unexpected account or hostname.

`pnpm run doctor` audits provider configuration against `.lvbt/infrastructure.config.ts` and
published manifests. `pass` confirms a match, `fail` identifies missing or mismatched configuration,
and `unknown` means the provider could not be inspected or returned an unrecognized response.
Unknown results never count as success. Draft projects do not acquire production routes.

Use `pnpm --silent run doctor --json` to capture only the structured report. The `run` keyword is
required because pnpm reserves `doctor` for its own package-manager diagnostics. Infrastructure
configuration checks do not replace live URL, TLS, header, preview, or rollback acceptance.

## Apply repository resources

```sh
pnpm provision --apply
```

The operation creates or reconciles:

- the production and pull-request preview environments on the existing public repository;
- Actions variables and narrowly scoped deployment secrets;
- the Labs custom domain, exact project routes, DNS, and TLS;
- the shared Cloudflare Web Analytics property;
- repository metadata consumed by `pnpm run doctor`.

The GitHub repository, its `Validate` branch rule, the Cloudflare zone, and the home and project
Workers establish the provider identities that provisioning reconciles against. Missing or
mismatched identities block writes before any provider state changes.

Provisioning is idempotent. Matching resources produce no change; drift creates an explicit update.
Resources outside the manifest remain untouched.

Use `pnpm --silent run provision --dry-run --json` for a machine-readable plan. The `managed` field
identifies resources handled by the command, and `remaining` lists failed or inaccessible
infrastructure checks. A verified write does not imply a complete installation: exit code `1`
indicates unresolved configuration even when some operations succeeded. `changed: null` indicates an
unconfirmed write; inspect provider state before retrying.

## Provision one project

`pnpm lab provision <slug> --apply` reconciles one project Worker route and GitHub deployment
metadata. The command refuses to create a route until the project passes `pnpm check`.

Run `pnpm lab doctor <slug>` after application. Successful diagnostics include DNS resolution, valid
TLS, expected route ownership, Worker version visibility, analytics placement, and secret names
without values.

## Recover authentication

An expired GitHub session returns exit code `2` with `gh auth login` as the recovery action. An
expired Cloudflare session returns the matching Wrangler login command. Reauthentication followed by
the same provisioning command resumes from the first unresolved resource.
