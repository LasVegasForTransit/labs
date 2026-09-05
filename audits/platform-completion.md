# Platform completion audit

The full platform objective remains open. A passing catalog build does not establish lifecycle,
infrastructure, migration, or organization-wide acceptance.

## Acceptance record

| Requirement                         | Evidence required                                                                                                                           | Current state                                                                                                                 |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Versioned web preset                | Published source tag; consumer provenance and offline integrity checks; reviewed update diff                                                | v0.2.7 vendored in Labs; local integrity and consumer checks pass; cross-repository adoption pending                          |
| Create                              | Both profiles generated from the pinned preset; guided and non-interactive flows; checks and browser tests pass                             | Vendored profiles, guided input, complete flags, and explicit apply implemented; failure recovery and full acceptance pending |
| Deprecate                           | Required reason and sunset; public shared notice; operational app                                                                           | CLI and both profile notices pass local browser checks; live acceptance pending                                               |
| Retire                              | API-isolated archive; checksums; stable URL; write bindings removed; rollback                                                               | Pending                                                                                                                       |
| Migrate                             | Fresh repository; provenance; CI/rules; stable route verification; deployment ownership transfer; catalog-only source removal; rollback     | Pending                                                                                                                       |
| Provision and doctor                | Idempotent API reconciliation, read-only inspection, dry-run/apply/JSON, external resource acceptance                                       | Manual home deployment verified; command suite pending                                                                        |
| Affected deployments                | Dependency graph tests; build-before-deploy; independent results; home last                                                                 | Planner, adapter, and CI wiring implemented locally; regression tests pass; live CI acceptance pending                        |
| PR previews                         | Existing Worker versions; temporary new Workers; close cleanup; staging for stateful apps                                                   | Pending                                                                                                                       |
| CI credentials                      | Scoped deployment credentials stored in Actions; successful CI deployment                                                                   | Pending                                                                                                                       |
| Analytics                           | Hostname property; production tracking; preview exclusion                                                                                   | Account API returned 403 during initial launch; unresolved                                                                    |
| Multi-Worker routing                | Live exact and wildcard paths override home without prefix collisions; unknown paths use home                                               | Local proxy tests pass; live lab-route acceptance pending                                                                     |
| Accessibility and visual acceptance | Axe, keyboard, reduced motion, console/network, desktop/mobile screenshots and baselines                                                    | Existing browser coverage is partial                                                                                          |
| Main website                        | Published Labs link; four Functions, redirects, headers, analytics, domain, previews, and rollback verified on Workers before Pages removal | Footer link prepared locally; hosting migration pending                                                                       |
| TransitMapper                       | Current origin/main retains Vite/React and backend; consumes the shared standard; product tests pass                                        | Fresh adoption audit pending                                                                                                  |
| Organization standard               | Every active repository audited against the reusable standard; exceptions explicit                                                          | Registry includes `.github`, `analytics`, `labs`, `repository-tooling`, `transit-mapper`, and `website`; rollout pending      |

## Release authority

On September 5, 2026, the maintainer authorized commits, the repository-tooling release, and the
required cross-repository review workflows. Branch protections and required checks remain in force.
No credential values belong in this record.

## September 5 validation update

Repository-tooling PRs #19 and #20 merged through required checks. The vendored preset in Labs
records `v0.2.7`, source commit `6f34bbba529a8ee53badbe6a1696658a0e0411aa`, and its content hash.
The offline integrity check and full Labs `pnpm check` pass. This proves local consumer adoption,
not completion of the organization-wide rollout. Further unproven tooling changes use prereleases.

The generator consumes vendored Astro and Vite templates. Both generated profiles passed local
builds, archive builds, and desktop/mobile browser tests in a disposable checkout. Guided creation
and external lifecycle acceptance remain outstanding. The affected-project planner has eight unit
tests, but is not connected to production deployment or PR preview workflows.

`pnpm lab deprecate` now supports guided required fields, complete flags, dry-run by default,
explicit apply, and structured output. Thirteen tests cover transitions, dates, successor
validation, dry-run immutability, atomic replacement, and idempotent reruns. The command preserves
unrelated source text and refuses computed manifest values. The full repository check passes after
this addition. Public notice integration, interactive terminal acceptance, and deployed operational
verification remain outstanding; deprecation is not yet accepted end to end.

The subsequent notice implementation adds React and Astro renderers, template integration, and
catalog inclusion for listed deprecated projects. Seven UI tests and five catalog visibility tests
pass. Two generated, disposable projects were deprecated through the CLI and verified under local
Wrangler: eight desktop/mobile browser checks pass across the two profiles, including route refresh,
sunset text, keyboard focus, horizontal overflow, and runtime errors. All four captured screenshots
were inspected. This uncovered and fixed Tailwind pruning shared light-theme tokens; `@theme static`
preserves their definitions without changing values. Root checks, production builds, and the
existing browser suite also pass. Live deprecation deployment and catalog ordering acceptance remain
open.

Deployment planning now reads the previous and current committed workspace graphs and reports
resolved commit IDs through `pnpm deploy:plan`. Git-fixture tests cover comparison, shared
dependency changes, missing refs, and non-execution of historical manifest expressions. Deployment
sequencing tests cover build-before-upload, independent app failures, verification failures,
rollback receipt retention, and withholding home after an app failure. These functions are not yet
connected to Cloudflare operations or the production workflow; the existing catalog-only deployment
remains.

The Cloudflare adapter and `pnpm deploy:affected` are now connected in the local workflow changes.
Version parsing was checked against live home deployment output: the current version remains
`2ae50b24-3d42-48d2-a784-627b60841961`. Nine new tests cover chronological version selection,
traffic-split refusal, structured upload receipts, deterministic artifact markers, stale/wrong-route
responses, pre-upload rollback journaling, and explicit apply flags. A local apply attempt correctly
refused the dirty checkout before remote mutation. Production workflow changes include the last
successful-run comparison base, a superseded-main guard, and receipt artifact retention. The adapter
acceptance test mocks Cloudflare commands and requests; a live CI deployment remains unverified.

Review exposed an unsafe comparison after partial failures. The workflow now uses an affected-only
comparison only after the immediately preceding run succeeds. Failed, uncertain, or retried runs
trigger a full deployment, including apps whose intermediate changes were reverted. Six regression
cases exercise baseline selection. Checkout validation now compares against live remote main after
builds and before uploads. A real local Git remote verifies refusal after main advances; two adapter
tests verify that failed post-build and pre-upload guards prevent uploads. These are local proofs,
not evidence of a successful production Actions run.

Creation now accepts guided terminal input, complete field flags, or a JSON manifest. It defaults to
a dry run and requires `--apply` to write files. JSON mode never prompts. Four input tests cover
these modes, conflicting options, dates, and code licensing. A real terminal session supplied a
missing license, printed the plan, and left no project directory. Explicit apply in the disposable
acceptance checkout generated an Astro project; all 12 targeted tasks passed, including build,
archive build, and two Worker browser tests. Both desktop and mobile screenshots were inspected.
Root `pnpm check` passes with 74 tooling tests. Creation failure recovery and broader lifecycle
acceptance remain open.
