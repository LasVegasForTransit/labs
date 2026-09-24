# Provision Labs

Provisioning reconciles GitHub, Cloudflare, DNS, routes, TLS, analytics, secrets, and variables from
repository state. Dashboard-only setup is drift, not an accepted installation step.

## Authenticate and inspect

### GitHub environments (first time only)

Skip this if `production` and `preview` already appear under repository → **Settings →
Environments**; provisioning creates them itself when they are missing. Do this before creating the
Cloudflare tokens below, because the next section pastes each token straight into one of these
environments.

1. Repository → **Settings → Environments → New environment**, name it `production`, then
   **Configure environment**. Only repository admins can do this.
2. Repeat step 1 for a second environment named `preview`.

### Get Cloudflare tokens ready (first time only)

Skip this section if `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_PREVIEW_API_TOKEN` already work in your
shell and the `production` and `preview` GitHub environments already list them. Provisioning is
idempotent, so a re-run only fills in whatever is still missing; it never asks for a value it
already has.

1. Open <https://dash.cloudflare.com/profile/api-tokens> and click **Create Token**.
2. Next to **Edit Cloudflare Workers**, click **Use template**. This grants exactly the permissions
   provisioning needs: Account · Workers Scripts · Edit, Account · Workers KV Storage · Edit,
   Account · Workers R2 Storage · Edit, Account · Workers Tail · Read, Account · Account Settings ·
   Read, Zone · Workers Routes · Edit, User · User Details · Read, and User · Memberships · Read. Do
   not add Account · D1 · Edit unless the deploy workflow applies D1 migrations.
3. Under **Account Resources**, choose **Include** and select the LVBT account, **Las Vegans for
   Better Transit** (never "All accounts").
4. Under **Zone Resources**, choose **Include → Specific zone** and select `lasvegasfortransit.org`,
   the zone `.lvbt/infrastructure.config.ts` names.
5. Name the token `labs deploy (GitHub Actions)`, leave the TTL empty so deploys keep working, click
   **Continue to summary**, then **Create Token**, and copy it immediately; Cloudflare shows it only
   once.
6. Before doing anything else, paste that value in two places: as the GitHub **environment secret**
   `CLOUDFLARE_API_TOKEN` on the `production` environment (repository → Settings → Environments →
   `production` → Environment secrets → Add environment secret, or
   `gh secret set CLOUDFLARE_API_TOKEN --env production` with the value on standard input, never as
   a command argument), and exported in your own shell before running `pnpm provision --apply` from
   your machine.
7. Repeat steps 1–5 for a second token named `labs preview (GitHub Actions)`, then paste it as the
   environment secret `CLOUDFLARE_PREVIEW_API_TOKEN` on the `preview` GitHub environment before you
   create any further token. Give this token the same permissions as the deploy token, then remove
   any it does not need: the preview token should not reach production routes, analytics, or
   application secrets, so pull-request previews stay isolated from production.
8. Provisioning also creates the account's Web Analytics property automatically; see
   [Web Analytics token](#web-analytics-token-usually-automatic) below. If that step fails with a
   permission error, the deploy token needs Web Analytics management access too. Cloudflare does not
   offer that as a pre-built template permission, so either add it to the token's custom
   permissions, or create the Web Analytics site by hand once and let provisioning pick it up on the
   next run.

`CLOUDFLARE_ACCOUNT_ID` (`2557b5c2e166292ded0f8425b73075e9`, the LVBT account, **Las Vegans for
Better Transit**) is also a `production` environment secret. Provisioning reads the account and zone
IDs from `.lvbt/infrastructure.config.ts` and writes the matching repository variables itself; you
do not set those by hand.

Authenticate the local CLIs without placing credentials in shell arguments:

```sh
gh auth login
pnpm exec wrangler login
```

Set `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_PREVIEW_API_TOKEN` in the command environment before
applying changes; see [Get Cloudflare tokens ready](#get-cloudflare-tokens-ready-first-time-only) if
you do not have them yet. GitHub CLI reads both tokens from standard input; neither appears in a
command argument.

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

`externalWorkers` records projects that use the Labs hostname while another repository owns their
deployment. Doctor verifies their routes and live probe. Provisioning does not create their Workers
or routes, and a mismatched route remains a conflict requiring review.

Use `pnpm --silent run doctor --json` to capture only the structured report. The `run` keyword is
required because pnpm reserves `doctor` for its own package-manager diagnostics. The same read-only
run requests the public hostname and verifies DNS and TLS reachability, security headers, release
markers, exact and subtree route ownership, the home fallback, and a real multi-Worker deployment.
Preview isolation and rollback remain exercised acceptance workflows because neither can be proven
from passive production inspection.

## Apply repository resources

```sh
pnpm provision --apply
```

The operation creates or reconciles:

- the public GitHub repository and its pinned organization ruleset;
- the production and pull-request preview environments;
- Actions variables and narrowly scoped deployment secrets;
- inactive bootstrap versions for missing source-backed Workers;
- immutable version preview URLs for each Worker deployed by Labs;
- the Labs custom domain, exact project routes, DNS, and TLS;
- the shared Cloudflare Web Analytics property;
- repository metadata consumed by `pnpm run doctor`.

The configured Cloudflare zone establishes the external account boundary and must already exist.
Provisioning stops before any write when that zone cannot be verified. GitHub resources reconcile in
dependency order: repository, ruleset and environment identities, environment policy and secrets,
then Cloudflare resources. A failed or unconfirmed stage withholds every dependent stage.

An active or deprecated lab with source under `apps/<slug>` receives a Worker identity when none
exists. Provisioning builds that app and uploads an inactive version; it does not activate the
version or replace production traffic. The normal deployment workflow activates and verifies the
version after every affected artifact has built successfully. Draft labs and catalog-only retired or
graduated records never receive bootstrap uploads.

Provisioning is idempotent. Matching resources produce no change; drift creates an explicit update.
Resources outside the manifest remain untouched. Running `pnpm provision --apply` again after a
successful run changes nothing: every check already matches what is configured, so nothing is
created, updated, secrets are not reset, and no Worker is rebuilt or re-uploaded; the command simply
confirms the result and reports success. Running it again after a failed or interrupted run resumes
from the first resource that did not finish — everything that already succeeded is left alone, and
only the remaining resources are created.

Use `pnpm --silent run provision --dry-run --json` for a machine-readable plan. The `managed` field
identifies resources handled by the command, and `remaining` lists failed or inaccessible
infrastructure checks. A verified write does not imply a complete installation: exit code `1`
indicates unresolved configuration even when some operations succeeded. `changed: null` indicates an
unconfirmed write; inspect provider state before retrying.

### Web Analytics token (usually automatic)

`pnpm provision --apply` creates the Cloudflare Web Analytics property for the Labs hostname and
writes its token into the `production` GitHub environment as the variable `PUBLIC_LVBT_CWA_TOKEN`.
This value is public (it ships inside the page), so it is a repository **variable**, not a secret.
Most volunteers never need to touch this by hand. To create the property yourself first instead:

1. Open <https://dash.cloudflare.com/2557b5c2e166292ded0f8425b73075e9/web-analytics> → **Add a
   site** → enter the Labs hostname.
2. Choose **Enable with JS Snippet installation**, not the automatic "Enable" option, because Labs
   loads the beacon itself, then finish adding the site.
3. Run `pnpm provision --apply`. It finds the site you just created by hostname, so it does not make
   a duplicate, and it reads and writes `PUBLIC_LVBT_CWA_TOKEN` for you — you never need to copy the
   token yourself.

## Verify the result

Run `pnpm lab doctor` after application. Successful diagnostics confirm the repository settings,
environment configuration, Worker identities, route ownership, custom domain, analytics property,
DNS, TLS, security headers, public release markers, and home fallback. Acceptance also requires a
completed preview-isolation run and an exercised production rollback.

## Recover authentication

An expired GitHub session returns exit code `2` with `gh auth login` as the recovery action. An
expired Cloudflare session returns the matching Wrangler login command. Reauthentication followed by
the same provisioning command resumes from the first unresolved resource.
