# Release candidate sign-off checklist

Target: `@worldhacker/kasane@1.0.0-rc.1`.

Status: awaiting the exact RC commit and protected-environment release-manager
approval.

## Product and API

- [x] No open P0 or P1 product defect exists at preparation time.
- [x] Beta public exports and option names remain frozen.
- [x] Changelog and beta-to-RC migration are complete.
- [ ] Exact RC commit passes required CI and the dispatched full pre-RC matrix.
- [ ] Extended property, fuzz, and performance nightly suites pass on the exact
  RC commit.

## Artifact and release

- [ ] Exact RC tarball passes allowlist, secret scan, publint, attw, packed
  consumers, install-script, size, and reproducibility gates.
- [ ] Stable projection differs only in `package.json` version and passes the
  `latest` publish rehearsal.
- [ ] Rollback and beta-to-RC upgrade pass on Node.js 22 and 24.
- [ ] Workflow artifact and npm registry tarball are byte-for-byte identical.
- [ ] npm records trusted-publishing provenance and the `rc` tag points to the
  exact version without changing `latest`.

## Security and operations

- [ ] Final security and threat-model audit is accepted with no known P0/P1
  defect.
- [ ] External private-reporting form and backup advisory/release access are
  independently exercised.
- [ ] The documented soak-equivalent test volume is accepted by the release
  manager.

## Signature

The signatory, UTC timestamp, exact commit, workflow run, artifact digest, and
approval evidence are recorded here only after the protected `npm` environment
is approved. An approval for a different commit or version is not transferable.
