# Migrate a lab

Graduation moves a mature lab into a fresh public repository while preserving its Labs route, Worker
identity, project docs, and operational history.

## Verify portability

Start with a clean project check and migration dry run:

```sh
pnpm check
pnpm lab migrate <slug> --prepare \
  --repository LasVegasForTransit/<repository> \
  --output ../<repository> --dry-run
```

The dry run plans a standalone tree from committed source and the project's pinned web preset. It
contains source, project docs, tests, assets, licenses, Worker configuration, CI, and
`MIGRATED_FROM.md`. The provenance file names the Labs URL, source path, and exact source commit.

Run the command without fields for guided prompts, or supply all fields with `--json` for structured
output. The default is a dry run. The source repository must be clean, and the destination's parent
directory must exist outside Labs.

Resolve every missing workspace dependency before exporting. A standalone project never imports
another Labs app or the Labs management CLI. Portable manifest and archive helpers come from
`@lvbt/lab-runtime`.

### Export and validate

Create the standalone directory and initialize its Git repository:

```sh
pnpm lab migrate <slug> --prepare \
  --repository LasVegasForTransit/<repository> \
  --output ../<repository> --apply
```

Preparation preserves Labs source and deployment ownership. It creates no remote repository and
changes no Worker, route, or secret. Rerunning preparation verifies the exported files; differences
stop the operation without overwriting independent work. Files, binary assets, and executable hooks
retain their committed content and permissions. Only generated repository configuration and
onboarding documents receive formatting.

Run `pnpm bootstrap`, `pnpm check`, `pnpm build`, `pnpm test:e2e`, and `pnpm test:archive` from the
standalone directory. Resolve failures there before transferring ownership. An `exported` result
confirms source preparation, not application acceptance or graduation.

## Transfer deployment ownership

Provision the public GitHub repository, required `Validate` check, production environment,
variables, and secrets. Keep the destination's `LVBT_DEPLOYMENT_OWNER` variable disabled while Labs
owns production deployment. Pause Labs ownership for the slug only after the standalone preview
passes, then enable ownership in the destination. Retain the previous Worker version for rollback.

The new repository deploys to the existing Worker and routes. Diagnostics check the stable Labs URL
before the local app source leaves the workspace.

## Complete and recover

Complete graduation by replacing `apps/<slug>` with a graduated catalog record that names the
canonical source repository. Home keeps the project visible according to its manifest.

If handoff verification fails, restore Labs deployment ownership and redeploy the retained Worker
version. Re-run the dry run after correcting the standalone tree; never create a second Worker or
temporary public slug as a handoff workaround.
