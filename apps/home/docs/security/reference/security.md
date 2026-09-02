# Labs home security

Home renders repository-controlled manifest data and contains no user input, account, database, or
project secret. Its Cloudflare Web Analytics token is a public production variable managed by the
platform.

## Trust boundary

Manifest validation treats titles, summaries, image paths, successor URLs, and repository URLs as
untrusted content before rendering. Project HTML never enters the home build.

The content security policy permits only home assets, approved project links, and the shared
analytics endpoint. Unknown routes return a branded not-found response without reflecting path text
as HTML.

## Response

Catalog injection, route takeover, incorrect canonical URLs, and analytics appearing in previews are
security-relevant failures. Recovery follows the home operations guide and platform incident
runbook.
