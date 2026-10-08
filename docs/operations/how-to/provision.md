# Set up Labs infrastructure

`platform.json` declares production requirements. `apps/home/platform.json` and
`apps/transit-funding/platform.json` declare the separate staging Workers using the canonical
configuration's explicit `preview` mode. Setup delegates to the shared LVBT platform standard; it
does not create a repository or deploy application code.

Run `pnpm bootstrap` for dependencies and local machine readiness, then
`pnpm preflight --production` to inspect declared provider resources and GitHub configuration. A
maintainer runs `pnpm bootstrap --production` in an interactive terminal to address missing
requirements. Existing `pnpm provision` is a read-only compatibility route into preflight;
`pnpm provision --apply` invokes the same interactive production bootstrap.

Preserve `CLOUDFLARE_API_TOKEN` in the existing `production` environment and the independent
`CLOUDFLARE_PREVIEW_API_TOKEN` in `preview`. Keep `PUBLIC_LVBT_CWA_TOKEN` in `production`; retained
builds read that environment's public variable. Never copy a production credential into the preview
environment. The manifest gives scope-specific steps for missing values.

Protected staging also requires `CF_ACCESS_CLIENT_ID` and `CF_ACCESS_CLIENT_SECRET` in `preview`. A
maintainer must configure Access service authentication for the reviewed staging and version preview
hostnames. Verify anonymous denial and the service token's authorized access. Missing Workers,
credentials, unreadable inventories or failed identity checks block readiness and publication.

The proposed staging identities are `lvbt-labs-home-staging` and `lvbt-labs-transit-funding-staging`
under the declared LVBT workers.dev account subdomain. Their actual existence, Access policies and
successful retained-artifact activation have not been verified by this migration. Bootstrap reports
missing Workers and the maintainer must provision and verify them before staging can succeed; the
migration does not provision them itself.

`pnpm run doctor` combines the shared platform readiness report with product-owned live routing,
security headers, release markers and the existing Labs Web Analytics property check.
`.lvbt/labs-health.config.ts` contains only the independently owned TransitMapper route probe. Its
Worker and public path remain under TransitMapper's deployment ownership.
