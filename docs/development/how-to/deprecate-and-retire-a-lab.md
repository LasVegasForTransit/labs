# Deprecate and retire a lab

> **Planned.** `pnpm lab deprecate` and `pnpm lab retire` are defined by the platform contract but
> not implemented yet; the steps below describe the intended behavior. Today `pnpm lab` offers
> `dev`, `preview`, and `status`.

Deprecation communicates an ending while the project still works. Retirement preserves its last safe
read-only form at the same public path.

## Deprecate

Apply a reason, sunset date, and successor when one exists:

```sh
pnpm lab deprecate <slug> \
  --reason "Replaced by a maintained regional model" \
  --sunset 2027-06-30 \
  --successor https://labs.lasvegasfortransit.org/replacement \
  --apply
```

The shared lifecycle banner presents the reason and date without covering project content. Home
marks the catalog entry as deprecated after the project route verifies.

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
