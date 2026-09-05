# Update the web standard

Labs uses the organization preset under `.lvbt/web-platform/`. Shared dependencies resolve from that
directory through local `file:` references. Change shared rules in repository-tooling, not in the
vendored copy.

## Review and apply

Choose a published repository-tooling release and inspect the proposed file changes:

```sh
RELEASE=v0.2.7
pnpm standards:update --release "$RELEASE" --dry-run --json
```

Read the release notes and review changes to the dependency catalog, configuration packages,
templates, and workflows. Apply the same release after review:

```sh
pnpm standards:update --release "$RELEASE" --apply
pnpm install
pnpm check
pnpm build
pnpm test:e2e
```

The update changes only the vendor tree and its provenance record. Application code and repository
workflows remain under local ownership. Catalog or workflow changes in the preset require a
corresponding reviewed consumer change before adoption is complete.

Commit `.lvbt/web-platform/`, `.lvbt/web-platform.json`, and the regenerated lockfile together.
Include changes to consumer configuration and dependency declarations in the same review.

## Verify or recover

`pnpm standards:check` verifies the preset without network access. It checks the recorded content
hash and executable permissions. Missing, added, or edited files stop verification and subsequent
updates. Do not edit the recorded hash to silence a failure.

Restore the vendor tree, provenance, package manifests, and lockfile from the same known-good
commit. Then run `pnpm install --frozen-lockfile` and `pnpm check`. Repair an intentional shared
change upstream and publish another release rather than keeping a local patch.
