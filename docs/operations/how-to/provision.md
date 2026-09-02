# Provision Labs

> **Planned.** `pnpm provision` and `pnpm doctor` are defined by the platform contract but not
> implemented yet; the steps below describe the intended behavior. Today `pnpm lab` offers `dev`,
> `preview`, and `status`.

Provisioning reconciles GitHub, Cloudflare, DNS, routes, TLS, analytics, secrets, and variables from
repository state. Dashboard-only setup is drift, not an accepted installation step.

## Authenticate and inspect

Authenticate the local CLIs without placing credentials in shell arguments:

```sh
gh auth login
pnpm exec wrangler login
```

Run a read-only comparison:

```sh
pnpm provision --dry-run
pnpm doctor
```

The result names the GitHub organization and repository, Cloudflare account and zone, required
resources, existing identifiers, and every proposed change. Stop when either command selects an
unexpected account or hostname.

## Apply repository resources

```sh
pnpm provision --apply
```

The operation creates or reconciles:

- the public `LasVegasForTransit/labs` repository;
- the `Validate` branch rule and production environment;
- Actions variables and narrowly scoped deployment secrets;
- the home and project Workers;
- the Labs custom domain, exact project routes, DNS, and TLS;
- the shared Cloudflare Web Analytics property;
- repository metadata consumed by `pnpm doctor`.

Provisioning is idempotent. Matching resources produce no change; drift creates an explicit update.
Resources outside the manifest remain untouched.

## Provision one project

`pnpm lab provision <slug> --apply` reconciles one project Worker, routes, bindings, and GitHub
deployment metadata. The command refuses to create a route until the project passes `pnpm check`.

Run `pnpm lab doctor <slug>` after application. Successful diagnostics include DNS resolution, valid
TLS, expected route ownership, Worker version visibility, analytics placement, and secret names
without values.

## Recover authentication

An expired GitHub session returns exit code `2` with `gh auth login` as the recovery action. An
expired Cloudflare session returns the matching Wrangler login command. Reauthentication followed by
the same provisioning command resumes from the first unresolved resource.
