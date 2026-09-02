# Secrets

> **Planned.** `pnpm doctor` and `pnpm provision` are defined by the platform contract but not
> implemented yet; the steps below describe the intended behavior. Today `pnpm lab` offers `dev`,
> `preview`, and `status`.

Secrets stay in scoped GitHub environments and Cloudflare secret stores. The repository records
names, owners, and recovery procedures without recording values.

## Platform inventory

| Secret or variable               | Location                   | Purpose                                   | Blast radius                                           |
| -------------------------------- | -------------------------- | ----------------------------------------- | ------------------------------------------------------ |
| `CLOUDFLARE_API_TOKEN`           | GitHub `production` secret | Upload Workers and manage declared routes | Labs Workers and routes granted to the token           |
| `CLOUDFLARE_ACCOUNT_ID`          | GitHub repository variable | Select the Cloudflare account             | Identifier only                                        |
| `CLOUDFLARE_ZONE_ID`             | GitHub repository variable | Select the LVBT DNS zone                  | Identifier only                                        |
| `CLOUDFLARE_WEB_ANALYTICS_TOKEN` | GitHub production variable | Render the production analytics beacon    | Public site measurement only                           |
| GitHub provisioning session      | Operator credential store  | Reconcile repositories and settings       | Permissions granted to the authenticated user or token |

Project-specific credentials appear in the owning project's security reference and production
environment. A project never reads another project's secret.

## Rotation

### Cloudflare deployment token

Create a replacement with the same narrow permissions, update the production environment, run a
credentialed deployment dry run, deploy one unchanged Worker version, and revoke the old token.
Finish with `pnpm doctor`.

### Analytics token

Create or select the Labs Web Analytics property, update the GitHub variable, deploy home and
affected projects, verify the beacon only in production, then remove the superseded token.

### GitHub provisioning credential

Revoke the operator session through GitHub, authenticate again, and run `pnpm provision --dry-run`.
No persistent provisioning token belongs in a tracked file or project environment.

## Prevention

Tracked environment examples contain names and formats, never values. Secret scanning runs before
commit and in `Validate`; GitHub push protection remains enabled. Forked pull requests receive no
production environment.

Commands accept secrets through interactive input or provider credential stores, never as retained
command-line arguments. Any value printed to a shared log is treated as compromised and rotated.
