# Stage and promote a Labs release

A push to `main` runs **Stage Labs release**. It builds and validates eligible Labs-owned active or
deprecated profiles, retains their compiled Worker and static assets, signs the exact saved release
envelope, and verifies protected staging before activation. It does not publish production. Home is
the automatic profile; Transit Funding remains draft and unlisted, and only an explicit manual
staging dispatch may preview it.

Run the **Stage Labs release** workflow manually on `main` to select a declared profile. The
existing `production` environment supplies the public analytics build variable; the existing
`preview` environment supplies its independent deployment token and Access credentials. Full
repository checks include browser, migration-export and isolated archive acceptance. Both staging
and promotion require the immutable proof from the pinned shared attestation workflow. Candidate
browser checks use the uploaded origin, with no local-server fallback or rebuild.

For a published Labs-owned profile, run **Promote Labs release** on `main`. Select the app and
optionally provide its staging run ID. The shared source resolver verifies the workflow, branch,
source commit and retained artifact. Product policy checks both the retained source's lifecycle and
current deployment ownership before publication. The exact saved artifact is uploaded and verified
again; no production rebuild occurs.

Draft profiles carry `previewOnly: true`, which blocks shared production operations before provider
calls. Publishing a draft requires the product's normal reviewed lifecycle change, public route
declaration and removal of this flag together. An old draft preview cannot be promoted merely
because a newer commit changes its status. Retired apps continue through verified archive
publication, and graduated or handed-off apps retain separate ownership.

A maintainer must first finish the staging resource and Access requirements listed in
[Set up Labs infrastructure](provision.md). This migration has not verified actual provider staging
or production promotion. `pnpm release:dry-run` builds no resources: after `pnpm build`, it packages
every declared profile locally and verifies saved bytes and release identity.

Rollback and deployment planning delegate publication to the same retained release engine. They
preserve lifecycle, route ownership and incident journals without rebuilding or directly activating
provider versions. A migration pause captures the prior verified saved release and provider version;
recovery disables destination ownership before requesting that exact retained run.

For a retired slug, declare a release profile with
`appDirectory: .wrangler/archive-releases/<slug>`, `typedConfig: cloudflare.config.mjs`,
`assetsDirectory: assets`, its permanent Workers and public path, and
`previewBindings: {ASSETS: {type: assets}}`. The Labs build adapter verifies `retired/<slug>` and
generates the canonical ASSETS-only Worker in that ignored directory. It leaves captured archive
bytes unchanged and explicitly retains no application secrets. Stage and promote this profile using
the same shared workflows; unknown or mismatched archive profiles fail product policy.
