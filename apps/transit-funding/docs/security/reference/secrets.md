# TransitFunding security

TransitFunding has no application secret, user account, persistent store, or write endpoint. The
project uses only the platform deployment credentials listed in the root
[secret inventory](../../../../../docs/security/reference/secrets.md).

## Public surface

The Worker serves static files and `/transit-funding/api/health`. Fiscal inputs ship with the
application bundle, and all calculations run locally in the browser. Source links navigate to
third-party public documents but never proxy through the Worker.

The content security policy restricts scripts, styles, images, connections, and frames to the
origins required by the built publication. User-controlled HTML never enters the rendering path.

## Response

Treat unexpected Worker behavior, asset substitution, source-link injection, or
content-security-policy bypass as a private security report. Route and deployment recovery follows
the project operations guide; deployment-token rotation follows the root secret inventory.
