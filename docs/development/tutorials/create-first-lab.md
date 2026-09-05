# Create a first lab

The tutorial creates a small unlisted publication, runs it at its production path, checks its
archive, and leaves it ready for review. It uses the `site` profile because a static project exposes
every shared workflow without adding application state.

## Generate the project

Create `curb-space-notes.json` outside the repository, replacing the maintainer with your GitHub
handle and the creation date with today's date:

```json
{
  "manifestVersion": 1,
  "slug": "curb-space-notes",
  "title": "Curb Space Notes",
  "summary": "A short publication about how curb space serves a city.",
  "kind": "publication",
  "profile": "site",
  "status": "draft",
  "visibility": "unlisted",
  "maintainers": ["your-github-handle"],
  "dates": { "created": "2026-09-04" },
  "previewImage": { "path": "/curb-space-notes/preview.png", "alt": "Annotated curb uses" },
  "licenses": {
    "code": "MIT",
    "content": "CC-BY-4.0",
    "data": "CC0-1.0",
    "assets": "CC-BY-4.0"
  }
}
```

From the repository root, run the generator with that file's absolute path:

```sh
pnpm lab create --manifest /path/to/curb-space-notes.json --dry-run --json
pnpm lab create --manifest /path/to/curb-space-notes.json --apply
pnpm install
```

The generator creates `apps/curb-space-notes`, validates its manifest, and writes its project docs.
The summary and license declarations appear in the catalog metadata even though an unlisted draft
stays off home.

## Run the production path

Start the lab:

```sh
pnpm lab dev curb-space-notes
```

Open the URL printed by the command. The page runs under `/curb-space-notes/`, matching production
asset paths and route refreshes.

Edit the generated publication content and save. The development server refreshes the page without
restarting the development server.

## Check the project

Run the complete project bar:

```sh
pnpm check
pnpm --filter @lvbt/lab-curb-space-notes build
pnpm --filter @lvbt/lab-curb-space-notes build:archive
pnpm --filter @lvbt/lab-curb-space-notes test:e2e
```

These commands run the repository checks, production and archive builds, and Playwright scenarios.
Open the production artifact separately with `pnpm lab preview curb-space-notes` when the built
output needs manual inspection.

## Prepare review

Add the preview image at `apps/curb-space-notes/public/preview.png`. Inspect the deployment bundle
without publishing it:

```sh
pnpm run deploy --filter curb-space-notes --dry-run
```

Keep the project unlisted during review. Publication requires an approved license declaration, a
working production route, and an explicit addition to the deployment workflow.

The project now exercises the same structure, checks, preview, and archive contract as a larger lab.
