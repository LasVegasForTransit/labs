# Catalog records

Catalog records preserve metadata for graduated and retired labs after active source leaves `apps`.
The manifest schema, permanent slug, lifecycle dates, licenses, successor, and canonical source
remain available to home.

Active project manifests stay beside their source. Lifecycle commands move the validated record into
`catalog` as one atomic transition.

Each record is a `LabManifestV1` JSON object at `catalog/<slug>.json`. Its slug matches the
filename, its status is `retired` or `graduated`, and no app directory owns the same slug. The home
catalog stays in `apps/home`. Records retain visibility, dates, licenses, preview metadata, and the
canonical source repository required for graduated projects.

`pnpm lab status <slug>` reads app manifests and catalog-only records. Home includes listed records
without requiring their former source packages. Missing catalog directories are treated as empty;
malformed records, symbolic links, and duplicate ownership fail validation.
