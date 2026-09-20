# Analytics

LVBT Labs uses `@lvbt/analytics` for privacy-preserving measurement. One Cloudflare Web Analytics
property covers `labs.lasvegasfortransit.org`; the first-party collector at
`events.lasvegasfortransit.org` accepts the package's typed conversion events. Projects do not load
independent trackers.

Measurement runs only in production. Local development, tests, pull-request previews, staging
Workers, framed embeds, and retirement archives contain no active analytics client. Global Privacy
Control and Do Not Track disable page and event measurement.

## Application contract

Astro projects add `labsAnalytics()` from `@lvbt/brand/analytics/astro` to their integration list.
Vite and React projects call `initLabsAnalytics()` from `@lvbt/brand/analytics` before rendering.
The brand package fixes the site identity to `labs.lasvegasfortransit.org`; applications never copy
the token, collector URL, privacy checks, or beacon setup.

Production builds receive `PUBLIC_LVBT_CWA_TOKEN` and `LVBT_REQUIRE_ANALYTICS=1`. The public token
identifies the Cloudflare property and is stored as a GitHub production environment variable. A
production build without the token fails. Other environments receive neither value.

## Content security policy

Production response headers allow scripts from `https://static.cloudflareinsights.com` and
connections to `https://cloudflareinsights.com` and `https://events.lasvegasfortransit.org`.
Projects retain the remaining shared restrictions and add another origin only when their own
documented feature requires it.

## Archive isolation

`pnpm build:archive` clears the production analytics environment before building. The archive check
then rejects executable HTML, JavaScript, module, or CSS assets that reference either analytics
host. Header files and source maps are metadata rather than executable requests; archive runtime
tests still block all external network access.

## Operational acceptance

`pnpm doctor` confirms the shared Web Analytics property and its production environment variable. A
production release is accepted after browser verification observes the beacon on the stable
hostname, finds no beacon in a preview or archive, and records an event at the first-party
collector. The collector dashboard and fixed-query report provide aggregate diagnostics without
exposing visitor-level records.
