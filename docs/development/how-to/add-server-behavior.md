# Add server behavior to a lab

Static and dynamic labs share one Worker deployment contract. Adding an API or Cloudflare binding
changes the project implementation without changing its slug, route, preview flow, or catalog
identity.

## Add the Worker entry point

Create the project-owned Worker module and set `main` in `wrangler.jsonc`. Keep static assets
configured in the same file. Route matching sends only the paths named by the project through Worker
code; ordinary assets retain direct static delivery.

Run Wrangler type generation after every binding change:

```sh
pnpm --filter <project-package> exec wrangler types
pnpm --filter <project-package> exec wrangler types --check
```

Application code imports the generated environment type. Handwritten binding interfaces and
hardcoded secrets fail `pnpm check`.

## Add bindings and secrets

Declare D1, KV, R2, Queues, service bindings, or Durable Objects in the project Wrangler
configuration. Add each persistent resource to the project operations and security docs with
ownership, migration, restore, and rotation details.

Use `wrangler secret put` for project secrets. Local values live in ignored development files and
never match production credentials.

Durable Object projects use their dedicated staging Worker for browser and migration checks.

## Verify the new surface

Add Worker unit tests, request tests under workerd, production-build browser coverage, and explicit
failure-path cases. `build:archive` removes the live dependency or replaces it with a captured
read-only representation.

Run `pnpm lab provision <slug> --dry-run` to inspect resource and route changes, then apply
provisioning and verify staging before merge.
