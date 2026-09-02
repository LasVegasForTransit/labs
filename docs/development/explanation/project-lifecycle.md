# Project lifecycle

Labs gives experiments a cheap starting point without making their public identity disposable.
Lifecycle state separates catalog communication, source ownership, and deployment ownership.

## States

### Draft

A draft runs in local and pull-request environments but stays out of the production catalog. Preview
deployments contain no production secrets or analytics.

### Active and deprecated

An active lab serves its stable Labs path. Listed projects appear on home; unlisted projects remain
reachable by direct URL.

A deprecated lab stays operational and displays its reason, sunset date, and successor. Existing
links continue to work while visitors move to the replacement.

### Retired and graduated

A retired lab serves its last safe read-only build at the original path. The Worker has no
write-capable bindings, and home places the project in the archive.

Graduation transfers source and deployment ownership to another repository. The slug, route, catalog
identity, and project documentation remain intact.

## Transitions

Lifecycle commands default to dry-run mode for remote or destructive changes. Each applied
transition writes catalog metadata, verifies the result, and records a rollback target before
removing the previous deployment owner.

The slug is permanent. A successor uses a distinct slug while the original path continues to
identify the original project.
