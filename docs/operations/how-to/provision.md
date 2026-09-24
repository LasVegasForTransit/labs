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

Both tokens are account API tokens, which belong to the LVBT account rather than to the person who
creates them, so provisioning and deploys keep working after that person leaves. Creating one needs
the Super Administrator role on the LVBT account. Wrangler accepts an account API token because the
workflows and provisioning also set `CLOUDFLARE_ACCOUNT_ID`.

1. In the Cloudflare dashboard, choose the LVBT account. Check that its name is **Las Vegans for
   Better Transit**; if it still says "Las Vegas for Better Transit", correct it under the account's
   settings before continuing. Go to **Manage Account → Account API Tokens**
   (<https://dash.cloudflare.com/2557b5c2e166292ded0f8425b73075e9/api-tokens>). Click **Create
   Token**, then **Create Custom Token**.
2. Name it `labs deploy (GitHub Actions)`. Under **Permissions**, add exactly these rows, which are
   what provisioning, `pnpm run doctor`, and the Deploy workflow call:
   - **Account · Workers Scripts · Edit**: Worker versions, workers.dev previews, and the Labs
     custom domain;
   - **Account · Account Settings · Edit**: creating the Web Analytics site, the one step that needs
     more than read access;
   - **Zone · Workers Routes · Edit**: the project routes on `lasvegasfortransit.org`;
   - **Zone · Zone · Read**: the zone check provisioning makes before any write.
3. Under **Account Resources**, choose **Include** and the LVBT account by name. Leave **All
   accounts** off so the token cannot act on another account. Under **Zone Resources**, choose
   **Include → Specific zone** and select `lasvegasfortransit.org`, the zone
   `.lvbt/infrastructure.config.ts` names. Leave **All zones** off so it cannot change another zone.
4. Leave the expiration empty so deploys keep working, click **Continue to summary**, then **Create
   Token**. Copy the token; Cloudflare shows it only once.
5. Before copying anything else, run
   `gh secret set CLOUDFLARE_API_TOKEN --env production --repo LasVegasForTransit/labs`, paste the
   token at the prompt, and press Enter. Check that `CLOUDFLARE_API_TOKEN` now appears under
   repository → **Settings → Environments → production → Environment secrets**. Add the same value
   to your local shell's `CLOUDFLARE_API_TOKEN` environment for `pnpm provision --apply`; do not put
   it in a command argument or tracked file.
6. Create the preview token the same way, named `labs preview (GitHub Actions)`, with only these
   rows: **Account · Workers Scripts · Edit** (upload and delete pull-request preview Workers) and
   **Zone · Workers Routes · Read** (the cleanup checks that a preview Worker has no routes before
   deleting it). Read-only route access prevents this token from changing production routing; its
   Workers Scripts permission can still edit Worker code, so restrict who can use the token. Select
   only the LVBT account and `lasvegasfortransit.org` zone, leave the expiration empty, create it,
   and copy it.
7. Before copying anything else, run
   `gh secret set CLOUDFLARE_PREVIEW_API_TOKEN --env preview --repo LasVegasForTransit/labs`, paste
   the token at the prompt, and press Enter. Check that it appears under **Settings → Environments →
   preview → Environment secrets**. Add the same value to your local shell's
   `CLOUDFLARE_PREVIEW_API_TOKEN` environment for provisioning.

If a token ever leaks, roll it on the same Account API Tokens page, then paste the new value in both
of its places before doing anything else.

`CLOUDFLARE_ACCOUNT_ID` (`2557b5c2e166292ded0f8425b73075e9`, the LVBT account) and
`CLOUDFLARE_ZONE_ID` are repository variables, not secrets. Provisioning reads both IDs from
`.lvbt/infrastructure.config.ts` and writes the matching variables itself; you do not set them by
hand.

Authenticate the local CLIs without placing credentials in shell arguments:

```sh
gh auth login
pnpm exec wrangler login
```

Set `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_PREVIEW_API_TOKEN` in the local command environment
before applying changes; see
[Get Cloudflare tokens ready](#get-cloudflare-tokens-ready-first-time-only) if you do not have them
yet. The `gh secret set` commands above read token values from standard input; neither token belongs
in a command argument.

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
