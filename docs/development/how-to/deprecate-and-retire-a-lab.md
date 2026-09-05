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

Run `pnpm test:archive` to build archives and run each declared retirement browser suite. A single
project runs through `pnpm exec turbo run test:archive --filter=<project-package>`.

Archive tests live under `tests/e2e/archive/` and use a separate `playwright.archive.config.ts`
without a preview server. Import `readProjectArchiveFiles` and `createArchiveContext` from
`@lvbt/labs-tooling/archive`, read the archive, and create the isolated context with the lab slug
and the test's viewport. The context serves captured files directly: no upstream server receives
requests. Uncaptured paths, external requests, writes, and WebSockets are denied; service workers
are blocked. Assert that `archive.failures` is empty after the workflow, and close `archive.context`
in a `finally` block.

The page cannot open WebRTC or WebTransport connections. This harness verifies offline behavior; it
is not a security sandbox for untrusted code.

`readProjectArchiveFiles()` reads `dist-archive` during ordinary test runs. During retirement
preparation, `LVBT_ARCHIVE_DIRECTORY` selects the absolute path of the captured snapshot. Keep this
helper in project suites so preparation verifies the files being stored rather than a later build.
Preparation publishes an artifact only after the suite succeeds and the snapshot checksums remain
unchanged. It leaves the app source in place for deployment verification and recovery.

Retrying preparation rechecks the stored snapshot without rebuilding the app. Its manifest, source
repository, and source commit must match the original retirement request. A checksum mismatch or
failed browser suite stops the retry and preserves the existing artifact for inspection.

Exercise every primary route and confirm that forms, account actions, writes, and live-data controls
either disappear or become clear read-only output. Static JSON and other captured data remain
readable. A successful page load alone does not verify the project workflow. Check the content or
visualization after each interaction and after reload.

Review the generated file inventory and checksums before applying retirement.

## Retire

### Prepare the archive

```sh
pnpm lab retire <slug> \
  --reason "The underlying program ended on 2027-06-30" \
  --apply
```

Run preparation from the repository root with committed source. Omit `--apply` to inspect the
retirement request without running project scripts or writing files. In a terminal, omitted slug and
reason flags prompt for input; `--json` requires complete flags.

The command stores the verified archive under `retired/<slug>` and changes the app manifest to
`retired`. Its `prepared` result is a local handoff, not a completed production retirement. Review
and commit those files through the repository's pull-request workflow. The archive records the
source commit and origin repository; unrelated source changes stop preparation so the artifact does
not claim provenance from different code.

Production deployment uses the existing Worker with asset-only bindings. Verify the original path
and retain the previous Worker version for rollback before removing app source or moving its
manifest into `catalog/<slug>.json`. A failed preparation preserves source and any stored artifact;
inspect both before retrying. JSON failures during `--apply` report `changed: null` because a
verified archive can exist even when the manifest update fails.

### Check the deployment

Check the deployed archive using the deployment commit and the current and previous Worker version
IDs from the production deployment journal:

```sh
pnpm lab retire <slug> --verify \
  --commit <deployment-commit> \
  --version <archive-worker-version> \
  --previous-version <rollback-worker-version> \
  --json
```

Verification is read-only. It checks the active version before and after requesting the public
archive, requires an asset-only Worker, compares its release provenance and every captured file, and
confirms that the recorded rollback version remains available. A `deployment-verified` result does
not remove source or activate another version. Keep the browser acceptance and rollback procedure
alongside this result; provider version availability alone does not prove a successful rollback.

### Finalize the catalog

After browser acceptance succeeds, finalize the catalog handoff with the same deployment identity:

```sh
pnpm lab retire <slug> --finalize \
  --commit <deployment-commit> \
  --version <archive-worker-version> \
  --previous-version <rollback-worker-version> \
  --apply --json
```

Without `--apply`, finalization checks the local state and live deployment but writes nothing. The
applied command repeats live verification, checks for source changes, and writes
`catalog/<slug>.json` before moving the app out of `apps/`. Commit the resulting source removals and
catalog record through review. The app directory, including ignored local files, remains in the
returned recovery directory under Git's local `lvbt-retirements` directory. Its `handoff.json`
records the deployment identity; this recovery copy is local, not a published artifact.

To undo an uncommitted handoff, move the recovery directory's `source` back to the original app path
only when that path is absent, then remove the matching catalog record. This restores local source
only; it does not change the live Worker. Use the deployment rollback procedure for the public site.
Repeating finalization after a completed handoff rechecks the deployment without moving or
overwriting files.

During the handoff, a retired manifest in `apps/<slug>` selects the matching stored archive for
deployment. The deployment does not rebuild that app or use its original Worker configuration.
Source remains available until verification succeeds; afterward, its metadata-only catalog record
selects the same archive and Worker. Archive changes and shared archive-runtime changes select that
Worker on either side of the handoff.

A tombstone requires `--tombstone`, an exception category, and a durable reason in project docs.
Security, legal, and technical impossibility are the accepted categories.
