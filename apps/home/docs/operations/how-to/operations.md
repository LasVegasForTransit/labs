# Operate Labs home

Home deploys as `lvbt-labs-home` and owns the custom domain fallback. Project routes take
precedence, so home incidents concern the catalog, archive, hostname root, or unmatched paths rather
than a project's runtime.

## Verify a deployment

Run `pnpm lab doctor home` after the production workflow. Verification covers:

- `/`, `/about`, `/archive`, and an unmatched path;
- links to every listed project and retired archive;
- catalog status, ordering, images, and canonical metadata;
- security headers and production-only analytics;
- representative mobile and desktop browser checks.

The home workflow runs after affected project Workers. A missing project route blocks home before a
broken catalog link reaches production.

## Roll back

Use `pnpm lab rollback home --version <version-id> --apply` for catalog, archive, metadata, or
fallback regressions. Roll back the owning project Worker for failures limited to one slug.

After rollback, verify a known active project route as well as an unmatched path. Together they
prove that route precedence and the home fallback still agree.
