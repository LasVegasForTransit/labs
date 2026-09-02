# Repository tooling

Repository tooling owns the `pnpm lab` interface, project generators, validation, lifecycle
transitions, provisioning, diagnostics, and test fixtures.

Human prompts and complete non-interactive flags call the same operations. Remote and destructive
commands support dry-run mode, and every command can return structured JSON for agents and CI.
