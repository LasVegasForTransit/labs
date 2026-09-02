# Create a first lab

> **Planned.** `pnpm lab create` is defined by the platform contract but not implemented yet; the
> steps below describe the intended behavior. Today `pnpm lab` offers `dev`, `preview`, and
> `status`.

The tutorial creates a small unlisted publication, runs it at its production path, checks its
archive, and leaves it ready for review. It uses the `site` profile because a static project exposes
every shared workflow without adding application state.

## Generate the project

From the repository root, install dependencies and run the generator:

```sh
pnpm install
pnpm lab create curb-space-notes \
  --title "Curb Space Notes" \
  --summary "A short publication about how curb space serves a city." \
  --kind publication \
  --profile site \
  --maintainer your-github-handle \
  --visibility unlisted \
  --code-license MIT \
  --content-license CC-BY-4.0 \
  --data-license CC0-1.0 \
  --assets-license CC-BY-4.0
```

The generator creates `apps/curb-space-notes`, writes its manifest and project docs, and runs the
project contract. The summary and license declarations appear in the catalog metadata even though an
unlisted draft stays off home.

## Run the production path

Start the lab:

```sh
pnpm lab dev curb-space-notes
```

Open the URL printed by the command. The page runs under `/curb-space-notes/`, matching production
asset paths and route refreshes.

Edit the generated publication content and save. The development server refreshes the page without
restarting the Worker simulation.

## Check the project

Run the complete project bar:

```sh
pnpm check
```

The command validates the manifest, licenses, docs, unit tests, production build, archive build, and
Playwright scenarios. Open the production artifact separately with
`pnpm lab preview curb-space-notes` when the built output needs manual inspection.

## Prepare review

Inspect the affected graph and remote provisioning diff:

```sh
pnpm check
pnpm lab provision curb-space-notes --dry-run
```

The pull request receives a temporary Worker preview. Production provisioning starts only after
`Validate` passes on the merge to `main`.

The project now exercises the same structure, checks, preview, and archive contract as a larger lab.
