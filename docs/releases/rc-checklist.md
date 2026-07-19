# Release candidate sign-off checklist

Target: `@worldhacker/kasane@1.0.0-rc.1`.

Status: accepted and signed for the immutable RC.

## Product and API

- [x] No open P0 or P1 product defect exists at preparation time.
- [x] Beta public exports and option names remain frozen.
- [x] Changelog and beta-to-RC migration are complete.
- [x] Exact RC commit passes required CI and the dispatched full pre-RC matrix.
- [x] Extended property, fuzz, and performance nightly suites pass on the exact
  RC commit.

## Artifact and release

- [x] Exact RC tarball passes allowlist, secret scan, publint, attw, packed
  consumers, install-script, size, and reproducibility gates.
- [x] Stable projection differs only in `package.json` version and passes the
  `latest` publish rehearsal.
- [x] Rollback and beta-to-RC upgrade pass on Node.js 22 and 24.
- [x] Workflow artifact and npm registry tarball are byte-for-byte identical.
- [x] npm records trusted-publishing provenance and the `rc` tag points to the
  exact version without changing `latest`.

## Security and operations

- [x] Final security and threat-model audit is accepted with no known P0/P1
  defect.
- [x] Private vulnerability reporting is enabled. The release manager accepts
  the documented solo-maintainer continuity risk; no backup maintainer exists
  or is planned for this solo project.
- [x] The documented soak-equivalent test volume is accepted by the release
  manager.

## Signature

Release manager/signatory: `W0rldHacker`. Signed through approval of the
protected `npm` environment on 2026-07-19 for commit
`7357246220e7c4b582b54d0d2a79aa4fa43aa2a8`, publication run
`29692739675`, and artifact SHA-256
`9097a10e7d321ccec837bb015d75293e04a48a97fc3da40240d6d4746513c067`.
The approval explicitly records acceptance of the solo-maintainer continuity
risk and is not transferable to another commit or version.
