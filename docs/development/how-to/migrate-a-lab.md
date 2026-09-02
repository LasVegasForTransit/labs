# Migrate a lab

> **Planned.** `pnpm lab migrate` is defined by the platform contract but not implemented yet; the
> steps below describe the intended behavior. Today `pnpm lab` offers `dev`, `preview`, and
> `status`.

Graduation moves a mature lab into a fresh public repository while preserving its Labs route, Worker
identity, project docs, and operational history.

## Verify portability

Start with a clean project check and migration dry run:

```sh
pnpm check
pnpm lab migrate <slug> --repository LasVegasForTransit/<repository>
```

The dry run builds a standalone tree from the project's pinned web preset. It contains source,
project docs, tests, assets, licenses, Worker configuration, CI, and `MIGRATED_FROM.md`. The
provenance file names the Labs URL, source path, and exact source commit.

Resolve every missing workspace dependency before applying the migration. A standalone project never
imports a Labs app or an unvendored Labs package.

## Transfer deployment ownership

Apply the operation:

```sh
pnpm lab migrate <slug> \
  --repository LasVegasForTransit/<repository> \
  --apply
```

The command creates or reconciles the public GitHub repository, required `Validate` check,
production environment, variables, and secrets. Labs pauses production ownership for the slug only
after the standalone preview passes.

The new repository deploys to the existing Worker and routes. Diagnostics check the stable Labs URL
before the local app source leaves the workspace.

## Complete and recover

The applied migration replaces `apps/<slug>` with a graduated catalog record that names the
canonical source repository. Home keeps the project visible according to its manifest.

If handoff verification fails, the command restores Labs deployment ownership and redeploys the
retained Worker version. Re-run the dry run after correcting the standalone tree; never create a
second Worker or temporary public slug as a handoff workaround.
