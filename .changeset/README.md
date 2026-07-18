# Changesets

Run `pnpm changeset` for every user-visible change. Select the SemVer impact and
start the summary with `Added:`, `Changed:`, `Fixed:`, or `Security:`. A major
Changeset also includes `Breaking: true`, `Breaking-Approval:`, and `Migration:`
metadata. A pre-`1.0` breaking minor uses the same metadata.

See [versioning and releases](../docs/versioning.md) for classification,
deprecation, prerelease, release PR, and trusted-publishing policy. Do not edit
the package version or changelog release entries directly.
