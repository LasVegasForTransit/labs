# Deployment reference

GitHub Actions owns validation, preview, production deployment, cleanup, and scheduled diagnostics.
Cloudflare dashboard build settings remain empty.

## Worker and route identity

### Names

| Deployable               | Worker name                    |
| ------------------------ | ------------------------------ |
| Home                     | `lvbt-labs-home`               |
| Project                  | `lvbt-labs-<slug>`             |
| Durable Object staging   | `lvbt-labs-<slug>-staging`     |
| New-project pull request | `lvbt-labs-pr-<number>-<slug>` |

Worker names derive from the permanent slug. Renaming a title never changes a Worker.

### Production routes

Home owns `labs.lasvegasfortransit.org` as a custom domain. Each project owns two zone routes:

```text
labs.lasvegasfortransit.org/<slug>
labs.lasvegasfortransit.org/<slug>/*
```

The exact route prevents a bare-path redirect from falling through to home. The subtree route covers
assets, nested pages, and project APIs. Route validation rejects a slug whose pattern overlaps
another project.

### Worker configuration

Every Worker uses `wrangler.jsonc`, a compatibility date within 30 days of the standard release,
`nodejs_compat`, generated binding types, and structured observability. Static asset requests skip
Worker code unless the application declares route handling.

Secrets never appear in Wrangler configuration. Non-secret environment values live under `vars`;
resource bindings match the owning project manifest.

Retirement replaces the application configuration with an asset-only bundle. Its handler accepts GET
and HEAD for captured URLs, redirects the bare slug to its trailing-slash URL, and rejects
uncaptured paths. The bundle uses one `ASSETS` binding and no application entry point, Node
compatibility flag, or application resource bindings.

Archive bytes use content-hashed storage names. Captured `_headers` and `_redirects` files remain
data rather than executable hosting configuration. The handler sets content types and the standard
MIME, referrer, permissions, and frame headers. Deployment verification checks remote bindings and
secrets separately; the absence of a binding in generated configuration does not prove its removal
from an existing deployment.

### Discovery endpoints

Home serves the hostname `robots.txt` and sitemap index. Each project serves `/<slug>/sitemap.xml`
from its own Worker. Production responses use canonical URLs on the Labs hostname; previews and
staging responses carry `X-Robots-Tag: noindex, nofollow` and stay out of every sitemap.

## GitHub workflows

### Validate

Pull requests and non-main pushes run the required `Validate` job. It executes the local check,
browser suite, Worker type generation check, deployment dry run, and affected-graph audit.

Same-repository pull requests upload previews after validation. Forks stop before credentialed
steps.

### Preview lifecycle

Existing Workers receive version previews and a stable pull-request alias. A new project receives a
temporary Worker because no production Worker identity exists before merge. The pull request comment
lists every affected preview and its slug path.

The close workflow deletes temporary Workers and aliases. Durable Object projects deploy to their
dedicated staging Worker instead of a version preview.

### Production

A push to `main` builds the complete affected set before the first upload. Project Workers deploy in
parallel where route ownership permits. Each public path passes HTTP, asset, header, and browser
smoke checks. Home deploys after all new catalog targets succeed.

GitHub records the source commit, Worker version, route set, and verification result as the
deployment artifact.

Retired catalog records remain deployable after their source packages leave the workspace. Changes
to their archive or catalog record select the archived Worker and home; deployment-tooling changes
also select archives. Archived dependencies and shared brand changes do not rebuild captured sites.
Graduated projects remain outside Labs deployment ownership.

Archive deployments prepare new bundles from verified stored bytes without changing the stored
archive. A deployment-specific release marker identifies the commit and captured content hash.
Verification compares that marker at the stable URL and inspects the uploaded version's bindings;
unexpected bindings or retained secrets fail verification and withhold home deployment.

## Analytics and headers

One Cloudflare Web Analytics property covers the Labs hostname. Production home and project builds
include the shared beacon; local, test, staging, archive verification, and pull-request builds omit
it.

Projects add no other tracker without an approved manifest exception and a content-security-policy
update. The standard headers include a restrictive content security policy, MIME sniffing
protection, referrer policy, permissions policy, and frame policy appropriate to the project's embed
contract.

## Rollback retention

Worker versions remain independently selectable. `pnpm lab rollback` records the incident, source
commit, previous version, restored version, and route verification. Database migrations and
destructive data changes require their own project runbook because Worker rollback does not reverse
stored data.
