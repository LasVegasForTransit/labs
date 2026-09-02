# Create a lab

> **Planned.** `pnpm lab create` is defined by the platform contract but not implemented yet; the
> steps below describe the intended behavior. Today `pnpm lab` offers `dev`, `preview`, and
> `status`.

Create a lab after its permanent slug, audience, public summary, framework profile, owner, and
licenses are known.

## Generate and review

### Choose the profile

Use `site` for publications and mostly static visualizations. Use `app` when the primary experience
depends on substantial client state or continuous interaction. Both profiles support React and
optional Worker code; profile choice describes the default application shape.

### Run the generator

Interactive creation prompts for every manifest field:

```sh
pnpm lab create
```

Agents and scripts pass the complete command described in
[Command reference](../reference/commands.md). Start with `--dry-run` when checking a slug or
profile without writing files.

### Inspect ownership

Confirm that product behavior, assets, sources, and project docs live under the new app. Move
reusable brand or foundational controls into shared packages only after the same need exists in
another project.

## Validate and publish

Run `pnpm check`, then inspect the app at its production path with `pnpm lab preview <slug>`. A
listed project appears on home only after its status changes from `draft` to `active` and the
project Worker passes the public route check.

Apply provisioning only after the dry run identifies the exact Worker, routes, GitHub settings, and
secrets:

```sh
pnpm lab provision <slug> --dry-run
pnpm lab provision <slug> --apply
```

Commit the generated app, docs, manifest, and provisioning metadata together.
