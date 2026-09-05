# Retired artifacts

Retirement artifacts are checksummed, self-contained, read-only builds. They sit outside the package
workspace and keep the original project route alive without retaining active dependencies or
write-capable bindings.

Each project directory contains its retired manifest, source provenance, SHA-256 checksums, and
captured site files. Verification runs against a staged copy before publication. An identical rerun
verifies the snapshot again without replacing the archive; different content at an occupied slug is
rejected.

Repository checks verify stored checksums and require each retired catalog record to match its
archive manifest. Edited, added, or removed files invalidate the archive. These integrity checks
complement browser tests with API access blocked; checksums alone do not prove offline behavior.
