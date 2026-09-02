# Project structure

The workspace enforces a one-way dependency graph: applications consume shared packages and tooling,
while packages and tooling remain independent of applications. Applications never depend on each
other.

```text
apps/                 independently owned lab projects
packages/             shared brand and foundational UI
catalog/              records for source outside the active workspace
retired/              reproducible read-only retirement artifacts
tooling/              lifecycle, provisioning, and validation tooling
tests/                repository-level browser and routing coverage
docs/                 repository documentation
.github/               collaboration and CI configuration
```

## Shared workspace

### Brand

`packages/brand` owns LVBT design tokens, Public Sans, shared assets, metadata defaults, and
attribution. Brand establishes identity without imposing an application layout.

### UI

`packages/ui` owns accessible foundational controls for Astro and React. Navigation, state,
workflows, and domain behavior remain project concerns.

## Applications

### Labs home

`apps/home` is the Astro catalog and archive. It reads validated manifests and owns the hostname
fallback route.

### TransitFunding

`apps/transit-funding` is the Vite and React fiscal visualization. Its model, sources, interface,
and project documentation stay under one application owner.

### Application layout

```text
apps/<slug>/
  package.json          project scripts and workspace dependencies
  lab.config.ts         LabManifestV1
  wrangler.jsonc        Worker, assets, routes, and bindings
  src/                  project-owned implementation
  public/               project-owned static assets
  tests/                unit, browser, archive, and support files
  docs/                 portable project documentation
```

Static projects omit a Worker source entry until server behavior exists. Their Wrangler
configuration still owns static assets, environment identity, and routes.

## Repository support

### Catalog and retirement

`catalog` stores records for graduated and retired projects after active source leaves `apps`.
`retired` stores checksummed read-only builds outside the package workspace, so archived
dependencies never affect current builds.

```text
catalog/<slug>.json
retired/<slug>/
  manifest.json
  checksums.sha256
  site/
```

### Tooling and automation

`tooling` owns `pnpm lab`, generators, validation, lifecycle transitions, provisioning, and
diagnostics. `.github` owns contribution templates and the GitHub Actions workflows that run those
interfaces.
