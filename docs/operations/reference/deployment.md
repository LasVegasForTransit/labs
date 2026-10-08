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
| New-project pull request | `lvbt-labs-<slug>-pr-<number>` |

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

Declared release profiles use canonical typed `deploy/<slug>/cloudflare.config.ts` configuration.
The shared producer derives the frozen Wrangler-compatible settings from that canonical factory,
retains compiled modules and assets, and seals their checksums. Wrangler mirrors are compatibility
outputs, never a separate production publication source. Secret declarations preserve names without
copying secret values; reviewed preview bindings are explicit and isolated.

`pnpm check` includes an uncached Turbo validation task that packages and verifies every declared
profile after builds, alongside browser and migration-export acceptance. No credentials or provider
writes are required for this local artifact check.

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

A same-repository pull request selects affected declared profiles using the product dependency graph
and lifecycle policy. Drafts remain available only through explicit manual staging. Each selected
profile delegates to the shared named PR workflow, using an isolated `${productionWorker}-pr-N`
namespace, reviewed preview resources and no public routes. Forks receive no preview credentials.

The shared operation verifies its marker and API response; the Labs browser adapter checks refresh,
page health, keyboard navigation, analytics absence, accessibility and desktop/mobile widths.
Closing the PR delegates deletion of only the derived same-account namespace. Previously created
legacy preview names require separately reviewed cleanup and are not guessed by the new deletion
operation.

### Production

A push to `main` stages home. Explicit staging selects other declared profiles; production is an
explicit retained promotion. The shared workflows verify source provenance, saved inventory,
protected preview acceptance, exact public marker and browser behavior. Product policy checks
lifecycle and current ownership as well as the retained source. Draft previews remain ineligible for
promotion.

Retired catalog records can declare ASSETS-only archive release profiles after app source leaves the
workspace. The Labs build hook verifies captured checksums and generates the canonical archive
Worker under `.wrangler/archive-releases/<slug>`, leaving the original archive immutable. The
standard saved producer and publisher handle that profile, including empty secret-retention
metadata. Graduated projects remain outside Labs ownership.

## Analytics and headers

One Cloudflare Web Analytics property covers the Labs hostname. Production home and project builds
include the shared beacon; local, test, staging, archive verification, and pull-request builds omit
it. The [analytics reference](analytics.md) defines the application, environment, privacy, content
security, and acceptance contracts.

Projects add no other tracker without an approved manifest exception and a content-security-policy
update. The standard headers include a restrictive content security policy, MIME sniffing
protection, referrer policy, permissions policy, and frame policy appropriate to the project's embed
contract.

## Rollback retention

Recovery selects a retained staging run and its exact source commit, with an explicit expected
production version when using `pnpm lab rollback`. Shared publication checks that precondition
before production SQL, upload or activation; it remains optimistic rather than an atomic provider
operation. The product journal records the delegated workflow outcome. Missing saved bytes and
unknown outcomes require reconciliation. Worker recovery does not reverse persistent data changes.
