# Deprecate and retire a lab

Deprecation communicates an ending while the project still works. Retirement preserves its last safe
read-only form at the same public path.

## Deprecate

Apply a reason, sunset date, and successor when one exists:

```sh
pnpm lab deprecate <slug> \
  --reason "Replaced by a maintained regional model" \
  --sunset 2027-06-30 \
  --successor https://labs.lasvegasfortransit.org/replacement \
  --successor-label "Open the maintained replacement" \
  --apply
```

Omit `--apply` to inspect the change first. Running the command without complete flags prompts for
the slug, reason, and sunset date. Use `--json` with complete flags for automation.

Run `pnpm format`, `pnpm check`, `pnpm build`, and `pnpm test:e2e`, then inspect the lab preview.
The shared lifecycle notice presents the reason, sunset date, and successor without replacing
project content. Listed deprecated projects remain in the home catalog. Confirm the primary workflow
still works and the successor link has a visible keyboard focus indicator before deployment.

## Verify the archive

Run `pnpm --filter <project-package> build:archive`, then execute the retirement browser suite with
external and API requests denied. Exercise every primary route and confirm that forms, account
actions, writes, and live-data controls either disappear or become clear read-only output.

Review the generated file inventory and checksums before applying retirement.

## Retire

```sh
pnpm lab retire <slug> \
  --reason "The underlying program ended on 2027-06-30" \
  --apply
```

The command stores the archive under `retired/<slug>`, deploys it through the existing Worker,
removes write-capable bindings, verifies the original path, and moves the catalog entry into the
archive.

A tombstone requires `--tombstone`, an exception category, and a durable reason in project docs.
Security, legal, and technical impossibility are the accepted categories.
