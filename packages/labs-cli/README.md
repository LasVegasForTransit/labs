# Labs operations

`@lvbt/labs-cli` owns the Labs repository's `pnpm lab` interface, catalog discovery, project
generation, lifecycle transitions, deployment policy, and provider target definitions. It contains
rules that apply specifically to `labs.lasvegasfortransit.org` and the Labs monorepo.

Human prompts and complete non-interactive flags call the same operations. Remote and destructive
commands support dry-run mode, and every command can return structured JSON for agents and CI.

Provider reads, reconciliation, release provenance, and Worker preview guards come from the vendored
`@lvbt/web-platform` package. Those operations belong to the organization web standard and remain
independent of Labs slugs, catalog records, and lifecycle states.
