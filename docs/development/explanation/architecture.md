# Architecture

## 1. Introduction and Goals

LVBT Labs publishes independently maintained transit experiments under one stable hostname. The
platform turns creation, updates, graduation, and retirement into routine work for a volunteer team.

### Quality goals

| Priority | Goal                                                                                             |
| -------- | ------------------------------------------------------------------------------------------------ |
| 1        | A project deploys, fails, migrates, and retires without coupling its runtime to another project. |
| 2        | Humans and agents use the same documented automation.                                            |
| 3        | Shared brand stays consistent without centralizing product behavior.                             |
| 4        | Public paths remain valid throughout a project's lifecycle.                                      |
| 5        | Static projects stay inexpensive and add server behavior without a hosting migration.            |

### Stakeholders

Visitors need fast, understandable work with honest lifecycle status. Project authors need
independence. Maintainers need one obvious workflow and errors that name the corrective action.

LVBT retains responsibility for identity, licensing, security, and operational ownership across the
collection.

## 2. Architecture Constraints

### Technical constraints

The pnpm and Turborepo workspace supports two framework profiles. Astro handles sites and
publications; Vite and React handle client-heavy tools. Cloudflare Workers hosts every deployable,
including static-only projects, and GitHub Actions owns validation and deployment.

Each deployable has a separate Worker from its first production release.

### Organizational constraints

Volunteer maintainers and automated agents share the same commands. Repository tooling therefore
avoids dashboard-only knowledge, hidden registration steps, and machine-specific configuration.

Diátaxis structures both documentation scopes. Project source and project docs stay together, while
shared code remains limited to brand, foundational UI, configuration, and tooling.

## 3. Context and Scope

### Business context

Visitors reach Labs through the home catalog, a direct project path, or a link from the main LVBT
website. The catalog presents active work and preserves the history of deprecated, retired, and
graduated projects.

Authors create and maintain projects through GitHub. A project can grow inside Labs or graduate to a
focused repository without changing its public Labs URL.

### Technical context

GitHub Actions validates source and sends deployable artifacts to Cloudflare. Cloudflare provides
routing, TLS, Worker execution, static asset delivery, and privacy-oriented analytics. GitHub
environments and Cloudflare secret stores hold deployment credentials.

### Scope boundary

Labs defines no common product data model, application state architecture, backend storage choice,
or page composition. Each project owns those decisions and records them in its own docs.

## 4. Solution Strategy

Four decisions shape the platform:

1. Independent Workers isolate runtime and deployment failures.
2. Specific project routes override the home Worker's hostname fallback.
3. A versioned manifest connects identity, catalog state, validation, and lifecycle commands.
4. A pinned organizational preset gives both framework profiles the same quality and deployment
   contract.

The preset is vendored rather than loaded at runtime. A checkout validates without network access,
and a graduating project leaves with the exact standard it already uses.

## 5. Building Block View

### Level 1

| Building block    | Responsibility                                                                  |
| ----------------- | ------------------------------------------------------------------------------- |
| Applications      | Public products and their Worker entry points                                   |
| Shared packages   | Brand, foundational UI, configuration, and test utilities                       |
| Lifecycle tooling | Creation, checks, preview, migration, retirement, provisioning, and diagnostics |
| Catalog records   | Durable identity and lifecycle metadata outside active source                   |
| Retired artifacts | Reproducible read-only builds                                                   |
| CI                | Validation, preview, deployment, cleanup, and scheduled diagnostics             |

Applications are the only public deployables.

### Level 2

Home reads active manifests and historical catalog records. Each lab owns its interface, behavior,
docs, and optional Worker code. Brand and UI packages supply visual and accessibility foundations,
but no project imports another project or delegates runtime work to home.

Lifecycle tooling is the control plane. It converts repository state into repeatable local, GitHub,
and Cloudflare operations.

## 6. Runtime View

### Visitor request

Cloudflare matches a project path to its Worker. Static assets bypass Worker code unless the project
explicitly handles the request. Paths without a project route reach home.

No application request passes through another lab.

### Merged update

CI identifies every affected project and builds all artifacts before upload. Changed project Workers
deploy first. Route diagnostics confirm the public path, then home deploys when the catalog output
changes.

A failure before route verification leaves home unchanged, so the catalog never links to an
unavailable release.

### Graduation and retirement

Graduation creates a standalone tree, provisions its repository, and transfers deployment ownership
while retaining the Worker and routes. After verification, Labs replaces active source with a
graduated catalog record.

Retirement builds the project with external and API requests denied. The checksummed result replaces
the active version at the same path, and write-capable bindings disappear from the Worker.

## 7. Deployment View

### Local and pull request environments

Local development runs one selected project through Wrangler simulation. Existing Workers use
version previews for same-repository pull requests; new projects use temporary preview Workers.
These previews exercise production build output without receiving production analytics or secrets.

Durable Object projects use dedicated staging Workers because version previews do not represent that
runtime.

### Production

Validated merges to `main` deploy through the GitHub `production` environment. Home owns
`labs.lasvegasfortransit.org` as a custom domain. Every project Worker owns its exact slug path and
subtree, with generated routing that rejects prefix collisions.

## 8. Crosscutting Concepts

### Identity and licensing

The permanent slug ties together source, catalog records, routes, analytics, and lifecycle history.
Code, content, data, and assets carry separate license declarations because software licensing does
not imply rights to every item a project publishes.

### Security and observability

Production secrets exist only in scoped GitHub environments and Cloudflare secret stores. Wrangler
generates binding types from configuration, preventing handwritten environment definitions from
drifting away from deployed resources.

Structured logs identify the project, environment, and deployment version. `pnpm run doctor` checks
provider configuration without changing it. Live route, TLS, header, preview, and rollback
acceptance establish production behavior separately.

### Testing

Static checks enforce workspace boundaries, manifests, licenses, docs, and exact tool versions. Unit
tests cover project logic. Browser tests cover base paths, route refreshes, keyboard use, reduced
motion, accessibility, network failures, and representative mobile and desktop layouts.

## 9. Architecture Decisions

### Workers for every deployable

One hosting model keeps static delivery cheap and gives every project a direct path to Worker APIs,
D1, Durable Objects, and service bindings. A mixed Pages and Workers platform duplicates deployment
and operational knowledge.

### GitHub Actions as the control plane

Repository-owned workflows make review, preview, production, and rollback visible in one place.
Cloudflare dashboard build settings remain outside the deployment contract.

### Two framework profiles

Astro serves content-led work; Vite and React serve client-heavy tools. A single framework either
burdens simple publications or constrains interactive applications.

### Fresh graduation history and static retirement

Graduation starts a focused repository history and records the originating Labs commit as
provenance. History extraction adds complexity without improving the stable public identity.

Retirement preserves the last safe read-only experience. Link removal and generic tombstones discard
useful public work and break references.

## 10. Quality Requirements

### Acceptance scenarios

| Quality         | Observable scenario                                                                                            |
| --------------- | -------------------------------------------------------------------------------------------------------------- |
| Independence    | A failed lab deployment leaves every other Worker and route untouched.                                         |
| Maintainability | A generated project passes `pnpm check` without manual registration.                                           |
| Portability     | A migration dry run produces a standalone tree with docs, tests, assets, and licenses.                         |
| Reliability     | Home publishes a catalog link only after the project route responds successfully.                              |
| Accessibility   | Browser checks pass with keyboard input, reduced motion, and automated WCAG rules at mobile and desktop sizes. |
| Recoverability  | A maintainer restores one project by selecting a retained Worker version.                                      |

### Performance

Static asset requests avoid Worker execution by default. Each project owns its performance budget
and records exceptions caused by its product requirements.

## 11. Risks and Technical Debt

### Shared-package blast radius

Brand and UI changes rebuild every dependent project. Small shared packages and strict ownership
boundaries keep that cost visible, but broad changes still require cross-project browser coverage.

### Route growth

Cloudflare routes accumulate as the catalog grows. Generated route ownership prevents manual drift,
while diagnostics detect collisions and missing paths. The home fallback remains a critical shared
dependency even though project runtimes are independent.

### Archive fidelity

Interactive projects often rely on changing APIs or external datasets. The archive contract favors a
self-contained read-only result, but some products lose functionality during retirement. Tombstone
exceptions require a recorded security, legal, or technical reason.

### Volunteer operations

Credential scope, account ownership, and recovery knowledge can concentrate in too few maintainers.
Idempotent provisioning, read-only diagnostics, and repository-owned runbooks reduce that
concentration without eliminating the need for regular access reviews.

### Pinned dependencies

Exact versions improve reproducibility and slow the adoption of upstream security and compatibility
fixes. Grouped update pull requests keep changes reviewable; dependency age remains an explicit
maintenance signal.

## 12. Glossary

| Term       | Meaning                                                                                 |
| ---------- | --------------------------------------------------------------------------------------- |
| Lab        | One experiment, tool, visualization, or publication                                     |
| Home       | The Labs catalog and hostname fallback application                                      |
| Profile    | The approved framework shape for a site or interactive app                              |
| Graduation | Transfer of project ownership to a standalone repository without changing its Labs path |
| Retirement | Replacement of an active project with its last safe read-only build                     |
| Preset     | Versioned organizational tooling vendored into a repository                             |
| Worker     | An independently deployed Cloudflare application and its static assets                  |
