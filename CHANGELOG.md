# Changelog

User-visible changes are grouped by outcome instead of by implementation or
SemVer level. The release PR generates dated entries from pending Changesets.

<!-- release-notes -->

## 0.1.0-alpha.0 - 2026-07-19

### Added

- Publish the first architecture-evaluation alpha with ESM and NodeNext sample consumers, release notes, known limitations, and a structured feedback tracker. This prerelease is not an API stability or production-readiness promise.

### Changed

- Audit the exact reproducible npm tarball, enforce its file and size allowlist, scan it for secrets and install scripts, and run packed consumers against the retained artifact before release.
- Improve configuration loading and provenance performance with bounded internal reuse, and add executable examples plus complete user, API, architecture, and contributor documentation without changing public semantics.
- Adopt the selected `@w0rldhacker/kasane` package scope, gate its first release on ownership confirmation, and define the SemVer, deprecation, migration, changelog, prerelease, and trusted-publishing release process.

### Fixed

- Reject revoked or otherwise uninspectable proxy containers with a sanitized normalization error instead of leaking a native exception.

## Unreleased

### Added

### Changed

### Fixed

### Security
