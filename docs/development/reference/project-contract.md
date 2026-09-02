# Lab project contract

Every lab follows one portable contract for identity, commands, ownership, documentation, and
publication. The contract supports both framework profiles without coupling their product
architecture.

## Identity and profile

### Slug

The permanent slug matches `^[a-z0-9]+(?:-[a-z0-9]+)*$`. It determines the application directory,
catalog key, Worker name, and public path. Lifecycle transitions never release a slug for reuse.

### Framework profile

| Profile | Use                                           | Framework                         |
| ------- | --------------------------------------------- | --------------------------------- |
| `site`  | Publications and mostly static visualizations | Astro with optional React islands |
| `app`   | Client-heavy interactive tools                | Vite and React                    |

Both profiles publish through Cloudflare Workers Static Assets. Optional Worker code adds server
behavior without changing the public URL or deployment model.

## Manifest

### Fields

Each active project owns one `LabManifestV1`.

| Field               | Type and constraint                                                         |
| ------------------- | --------------------------------------------------------------------------- |
| `manifestVersion`   | Literal `1`                                                                 |
| `slug`              | Permanent slug matching the repository pattern                              |
| `title`             | Non-empty public name, at most 80 characters                                |
| `summary`           | Plain-text catalog description, at most 240 characters                      |
| `kind`              | `tool`, `visualization`, or `publication`                                   |
| `profile`           | `site` or `app`                                                             |
| `status`            | `draft`, `active`, `deprecated`, `retired`, or `graduated`                  |
| `visibility`        | `listed` or `unlisted`                                                      |
| `maintainers`       | Non-empty array of GitHub handles                                           |
| `dates.created`     | ISO 8601 calendar date                                                      |
| `dates.published`   | ISO 8601 calendar date; required outside `draft`                            |
| `dates.deprecated`  | ISO 8601 calendar date; required for `deprecated`                           |
| `dates.retired`     | ISO 8601 calendar date; required for `retired`                              |
| `dates.graduated`   | ISO 8601 calendar date; required for `graduated`                            |
| `lifecycle.reason`  | Public explanation; required for `deprecated` and `retired`                 |
| `lifecycle.sunset`  | ISO 8601 calendar date; required for `deprecated`                           |
| `previewImage.path` | Project-relative image path                                                 |
| `previewImage.alt`  | Non-empty accessible description                                            |
| `licenses`          | Object with non-empty `code`, `content`, `data`, and `assets` values        |
| `successor`         | Optional object with `url` and `label`                                      |
| `sourceRepository`  | Canonical HTTPS repository URL; required for `graduated`                    |
| `exceptions`        | Optional approved exceptions with kind, reason, approver, and approval date |

### Derived values

Worker names and routes come from the slug. Authors never supply independent deployment names, which
prevents catalog and route drift.

### Status consistency

Lifecycle dates and fields match the selected status. Dates remain chronological, successors use
HTTPS URLs, and a graduated project has no active workspace package. An exception kind is
`analytics`, `tombstone`, or `security-header`; each exception includes enough rationale for later
review.

## Project surface

### Commands

Every active project exposes `dev`, `build`, `build:archive`, `test`, and `test:e2e`. Commands run
from the project directory and through the root workspace.

`build:archive` produces a self-contained, read-only representation with no API or write-capable
binding. A documented security, legal, or technical exception replaces the archive with a tombstone.

### Dependencies

Applications depend on shared workspace packages and never on another application or its build
output. Shared packages contain brand, foundational UI, configuration, and test utilities. Business
logic and page composition stay inside the owning project.

### Documentation

The project README and `docs/` tree move with the source during graduation. Claims, datasets, and
assets carry source and license references beside the project that uses them.

### Metadata

The manifest provides metadata defaults for the project root. Crawlable nested routes declare
`PageMetadataV1` records and render complete metadata in their initial HTML response. Canonical
URLs, collection title suffixes, robots directives, social fields, sitemap membership, and
structured data follow the [metadata and discovery contract](metadata-and-discovery.md).

## Publication

Draft projects stay out of the production catalog. Listed active projects appear on home. Deprecated
projects remain available with a visible reason and successor. Retired projects serve a read-only
archive at the same path. Graduated projects preserve their Labs identity while another repository
owns deployment.
