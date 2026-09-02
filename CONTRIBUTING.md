# Contributing to LVBT Labs

LVBT Labs accepts code, design, research, data work, writing, and local transit knowledge.
Contributions address either the shared platform or one contained lab.

## Getting started

The [documentation index](docs/README.md) describes the platform. Each lab has its own README and
documentation index for product-specific work.

Run `pnpm bootstrap` once, `pnpm lab dev <slug>` for the selected project, and `pnpm check` before
review. [Start here](docs/development/tutorials/start-here.md) walks through the first hour.

## Working agreements

### Documentation

Behavior and documentation change together. Platform material belongs under `docs/`; project
material belongs under `apps/<slug>/docs/`.

[Documentation structure](docs/development/reference/documentation-structure.md) defines the domain
and Diátaxis categories. Prose names its subject directly, uses present tense, and remains
understandable without relying on headings for context.

### Changes

Keep each pull request focused on one platform capability or one lab. Shared brand and UI changes
identify every affected lab. Application code never depends on another application's source or build
output.

`pnpm check` validates formatting, Markdown style and links, the repository shape rules, lint,
types, and unit tests; `pnpm test:e2e` runs the browser tests and `pnpm build` the production
builds.

## Community and licensing

### Conduct and support

The [Code of Conduct](CODE_OF_CONDUCT.md) governs participation. [Support](SUPPORT.md) covers public
questions, and [Security](SECURITY.md) covers private vulnerability reports.

### License

Code contributions use the [MIT License](LICENSE). Project content, data, and assets retain the
licenses declared by their owner.
