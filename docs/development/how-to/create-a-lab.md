# Create a lab

Create a lab after its permanent slug, audience, public summary, framework profile, owner, and
licenses are known.

## Generate and review

### Choose the profile

Use `site` for publications and mostly static visualizations. Use `app` when the primary experience
depends on substantial client state or continuous interaction. Both profiles support React and
optional Worker code; profile choice describes the default application shape.

### Run the generator

Prepare a JSON manifest matching the [project contract](../reference/project-contract.md). New
projects use `draft` status and `unlisted` visibility. The manifest declares the permanent slug,
profile, maintainers, dates, preview image, and all four licenses.

```sh
pnpm lab create --manifest /path/to/manifest.json --dry-run --json
pnpm lab create --manifest /path/to/manifest.json --json
pnpm install
```

The generator creates the selected Astro or React application, Worker routing, shared tooling
configuration, documentation, and unit and browser tests. Existing directories are never replaced.
Add the preview image declared by the manifest before publication.

### Inspect ownership

Confirm that product behavior, assets, sources, and project docs live under the new app. Move
reusable brand or foundational controls into shared packages only after the same need exists in
another project.

## Validate and publish

Run `pnpm check`, then inspect the app at its production path with `pnpm lab preview <slug>`. A
listed project appears on home only after its status changes from `draft` to `active` and the
project Worker passes the public route check.

Inspect the Worker deployment before publishing:

```sh
pnpm run deploy --filter <slug> --dry-run
```

Commit the generated app, docs, manifest, and provisioning metadata together.
