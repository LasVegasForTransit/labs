# Platform resources

> **Planned.** `pnpm provision` and `pnpm doctor` are defined by the platform contract but not
> implemented yet; the steps below describe the intended behavior. Today `pnpm lab` offers `dev`,
> `preview`, and `status`.

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

Repository rules require pull requests, `Validate`, resolved conversations, and linear history.
Workflow permissions stay read-only except for the jobs that publish previews, deployments, and
lifecycle metadata.

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

`pnpm provision` owns GitHub and Cloudflare configuration. `pnpm doctor` checks the same resource
graph without changing it. A provider dashboard edit appears as drift on the next run and returns to
the repository-defined state after reviewed application.
