# Create a lab

Create a lab after its permanent slug, audience, public summary, framework profile, owner, and
licenses are known.

## Generate and review

### Choose the profile

Use `site` for publications and mostly static visualizations. Use `app` when the primary experience
depends on substantial client state or continuous interaction. Both profiles support React and
optional Worker code; profile choice describes the default application shape.

### Run the generator

Run `pnpm lab create` for guided input. It asks for the project's name, permanent slug, profile,
maintainers, preview image, and licenses, then lists the files without writing them. Add `--apply`
to create the project. Supplied flags skip their corresponding questions.

For automation, prepare a JSON manifest matching the
[project contract](../reference/project-contract.md). New projects use `draft` status and `unlisted`
visibility. The manifest declares the permanent slug, profile, maintainers, dates, preview image,
and all four licenses.

```sh
pnpm lab create --manifest /path/to/manifest.json --dry-run --json
pnpm lab create --manifest /path/to/manifest.json --apply --json
pnpm install
```

The generator creates the selected Astro or React application, Worker routing, shared tooling
configuration, documentation, and unit and browser tests. Existing directories are never replaced.
Add the preview image declared by the manifest before publication.

### Recover from a failed creation

Formatting runs in a temporary directory before the generator claims the project directory. A
formatting failure leaves the slug available for retry. Publication failures remove unchanged files
from that attempt and preserve conflicting or edited files.

When the command reports incomplete cleanup, inspect the named directory before retrying. Preserve
any work it contains, then move it out of `apps/` once its ownership is clear. Do not delete an
existing project to make its slug available. After a forcibly stopped process, inspect both the
project directory and any `.lvbt-create-*` directory before removing incomplete generated output.

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
