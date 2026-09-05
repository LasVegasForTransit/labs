# Lab runtime

`@lvbt/lab-runtime` provides manifest validation and isolated archive testing for independent labs.
It contains no repository-management commands and does not depend on the home catalog or another
application.

Import `LabManifestV1Schema` and `validateManifestForDirectory` from `@lvbt/lab-runtime/manifest`.
Archive browser suites use `createArchiveContext` and `readProjectArchiveFiles` from
`@lvbt/lab-runtime/archive`. File-only checks import `@lvbt/lab-runtime/archive-files`.

The package travels with a project during migration. Repository discovery, deployment ownership,
provisioning, and lifecycle commands remain in `@lvbt/labs-tooling`.
