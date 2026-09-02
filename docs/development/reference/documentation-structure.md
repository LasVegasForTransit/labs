# Documentation structure

LVBT Labs separates documentation by owner, subject, and purpose. Platform rules stay easy to find,
while each lab carries enough context to leave the monorepo intact.

## Ownership

### Repository documentation

Root `docs/` covers the shared platform: workspace boundaries, project contracts, lifecycle policy,
deployment, security, and governance.

### Project documentation

`apps/<slug>/docs/` covers one lab's product behavior, domain model, data sources, architecture,
operations, and security surface. The project README is the entry point.

Graduation moves the project README and docs with the source. Labs retains only the catalog record
and links to the canonical repository.

## Organization

### Domains

The first directory names the subject.

| Domain        | Scope                                                  |
| ------------- | ------------------------------------------------------ |
| `product`     | User-facing concepts and tasks for one lab             |
| `development` | Architecture, local work, checks, and source ownership |
| `operations`  | Deployment, rollback, recovery, and external resources |
| `security`    | Secrets, threat surfaces, reporting, and rotation      |

Repository docs normally use `development`, `operations`, and `security`. Project docs add `product`
for user-facing material.

### Diátaxis types

The second directory identifies the purpose.

| Directory     | Purpose                                    | Typical form             |
| ------------- | ------------------------------------------ | ------------------------ |
| `tutorials`   | Teach through a complete guided experience | Sequential learning path |
| `how-to`      | Complete a specific task                   | Goal-oriented procedure  |
| `reference`   | State facts, contracts, and inventories    | Precise lookup material  |
| `explanation` | Develop understanding                      | Rationale and tradeoffs  |

One document serves one primary purpose. How-to guides link to contracts rather than reproducing
them, and explanation stays separate from operational steps.

## Writing standard

### Navigation

Every docs root has a `README.md` organized by Diátaxis type. Empty categories stay out of the
index. Domain indexes appear only when another navigation level improves scanning.

Major concerns use `##`; related concepts sit beneath them as `###` subsections. A flat run of
top-level headings usually means the document lacks grouping. Headings label the structure, while
the prose still names its subject and makes sense on its own.

### Prose

Prose names its subject directly, uses present tense, and states observable behavior or normative
requirements. Headings improve navigation but never supply context that the paragraph itself omits.

Paragraph length follows the idea. A short fact remains short; a connected argument gets enough room
to establish cause and effect. Repeated templates, status narration, and speculative filler do not
belong in maintained docs.

### Names

Markdown filenames use lowercase kebab-case. Reference and explanation titles use concrete noun
phrases. How-to titles name the task in imperative form. Relative links connect files inside the
repository.

## Required material

The repository includes its README, contribution and community policies, documentation index,
architecture, project structure, project contract, and deployment model.

An active lab includes a README, docs index, product brief, and any source, license, operational, or
security references required by its behavior. New documents enter the tree when they contain durable
information, not to reserve a category.
