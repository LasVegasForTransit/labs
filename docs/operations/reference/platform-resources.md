# Platform resources

Resource names derive from repository and project identity. Provider-generated IDs live in
provisioning metadata and remain absent from prose documentation.

## GitHub

| Resource             | Identity                       | Ownership                                     |
| -------------------- | ------------------------------ | --------------------------------------------- |
| Repository           | `LasVegasForTransit/labs`      | Source, issues, checks, and deployments       |
| Default branch       | `main`                         | Production source                             |
| Required check       | `Validate`                     | Merge gate                                    |
| Environment          | `production`                   | Deployment secrets, variables, and protection |
| Environment          | `preview`                      | Isolated pull-request deployment credential   |
| Project repositories | `LasVegasForTransit/<project>` | Graduated source and deployment ownership     |

Repository rules follow the vendored `.lvbt/web-platform/standards/ruleset.json`, including pull
requests, `Validate`, and linear history. Workflow permissions stay read-only except for the jobs
that publish previews, deployments, and lifecycle metadata.

## Cloudflare

| Resource       | Identity                      | Ownership                                  |
| -------------- | ----------------------------- | ------------------------------------------ |
| Zone           | `lasvegasfortransit.org`      | DNS and Worker routes                      |
| Custom domain  | `labs.lasvegasfortransit.org` | Home Worker fallback                       |
| Home Worker    | `lvbt-labs-home`              | Catalog, archive, about, and unknown paths |
| Project Worker | `lvbt-labs-<slug>`            | Exact project path and subtree             |
| Staging Worker | `lvbt-labs-<slug>-staging`    | Durable Object and binding verification    |
| Web Analytics  | Labs hostname property        | Production traffic measurement             |

Project resources such as D1, KV, R2, Queues, and Durable Objects derive their names from the slug
and appear in the owning project's operations reference.

## Readiness and product health

The root `platform.json` and each app's staging manifest declare provider requirements for shared
preflight and maintainer bootstrap. `pnpm provision` delegates to read-only preflight; explicit
`--apply` delegates to interactive shared bootstrap. It never creates a repository or deploys code.

`pnpm run doctor` adds product-owned live route, security-header, release-marker and analytics
checks. `.lvbt/labs-health.config.ts` declares the independently owned TransitMapper probe. Its
routes and deployments remain under its source repository's control.

Main pushes retain and verify staging artifacts. Production requires explicit promotion of the same
verified artifact. Draft apps permit manual preview only, and retired, graduated and migrated
projects keep their separate publication ownership. See [Stage and promote](../how-to/promote.md)
and [Set up infrastructure](../how-to/provision.md) for requirements and unverified provider gates.
