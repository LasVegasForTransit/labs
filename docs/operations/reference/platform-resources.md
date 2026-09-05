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

## Reconciliation

`pnpm provision` owns GitHub and Cloudflare configuration. `pnpm run doctor` compares provider
configuration with `.lvbt/infrastructure.config.ts` without changing it. A provider dashboard edit
appears as drift on the next run and returns to the repository-defined state after reviewed
application.
