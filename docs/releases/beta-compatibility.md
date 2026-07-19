# Beta compatibility and gate report

Status: accepted after protected publication and registry verification.

## Requirement and defect review

- Open P0 product defects: **0**.
- Open P1 product defects: **0**.
- Open GitHub issues at review time: **0**.
- Open dependency-update pull requests: six; all affect development tooling or
  pinned Actions and do not expand beta scope.

All P1 functional groups are covered: provider-neutral core (`REQ-CORE-002`),
snapshot/path/provenance (`REQ-SNAP-001`, `REQ-PROV-002`, `REQ-PROV-003`,
`REQ-PATH-002`), sources and validation (`REQ-SRC-002`, `REQ-SRC-004`,
`REQ-SRC-005`, `REQ-VAL-001`, `REQ-VAL-003`), security and diff
(`REQ-SEC-004`, `REQ-SEC-005`, `REQ-DIFF-001`, `REQ-DIFF-002`), TypeScript and
packaging (`REQ-TYPE-001`, `REQ-TYPE-002`, `REQ-PKG-002`), performance
(`REQ-QUAL-003`), documentation (`REQ-DOC-001`), and release security policy
(`REQ-SEC-006`). Lifecycle requirements that explicitly target RC or stable
remain gated by their later release stages.

## Consumer matrix

| Scenario | Package mode | Assertions | Alpha upgrade |
| --- | --- | --- | --- |
| Backend service | JavaScript ESM | defaults/env/secret layers, provenance, redaction | Required |
| Tool/CLI-like | JavaScript ESM | argument override, remove, safe formatted explain | Not required |
| Test infrastructure | JavaScript ESM | isolated snapshots, deterministic diff, secret canary | Required |
| General package resolution | JavaScript ESM | root/subpath/dynamic imports; deep and CJS rejection | Existing packed gate |
| Typed application | TypeScript NodeNext | inference, readonly output, Standard Schema, type boundaries | Existing packed gate |

The required CI matrix runs packed consumers on Node.js 22 and 24, repeats
runtime consumers on Windows and macOS with Node.js 24, and runs post-publish
registry plus alpha-to-beta upgrade consumers on Node.js 22 and 24.

The required
[main CI run](https://github.com/W0rldHacker/kasane/actions/runs/29684680110)
and protected
[release run](https://github.com/W0rldHacker/kasane/actions/runs/29684760236)
passed. Registry consumers covered all five scenarios on Node.js 22.23.1 and
24.18.0 with TypeScript 6.0.3 and no dev dependencies. Backend and
test-infrastructure projects also upgraded successfully from the published
`0.1.0-alpha.0` to `0.1.0-beta.1` on both Node.js versions.

The release workflow artifact and downloaded registry archive were compared
byte for byte. Both have SHA-256
`dfbbfc67b8f4ec5ac0e2ff1dd7cc4334b87b01329b0a128e902a3a471d079c62`.
The published package contains 126 files and has an unpacked size of 268,197
bytes, within the 500 KB budget.

## Performance report

PERF-002 is accepted in
[ADR-0007](../adr/0007-measured-hotspot-optimization.md). It records before and
after duration/memory evidence without public semantic changes or a new
unbounded cache. `pnpm bench:check` covers 42 approved scenarios; hosted Ubuntu
x64 Node.js 24 additionally enforces hard duration and retained-heap budgets.

## Security report

- Repository visibility: public, verified 2026-07-19.
- GitHub Private Vulnerability Reporting: enabled, verified through the
  repository API 2026-07-19.
- Supported prerelease policy, private reporting link, embargo flow,
  advisory/CVE criteria, patch coordination, and guarantee boundaries are
  published in `SECURITY.md`.
- Security/fuzz canaries, dangerous-key rejection, redaction, tarball secret
  scan, and incident tabletop checks are automated.

Maintainer redundancy is the only open operational follow-up: the repository
currently has one admin maintainer. Owner: `W0rldHacker`; severity: Medium;
target: before RC; outcome required: grant a trusted backup maintainer the
minimum access needed for private advisory and coordinated release continuity.
This does not disable the active private reporting channel or weaken the beta
artifact gates.

## Documentation review

README quick start, executable examples, API reference, env/merge/validation/
security/diff guides, limitations, platform support, versioning, migrations,
ADR index, and contributor policies are part of `pnpm docs:check`. The beta
scope introduces no undocumented feature or new P2 capability.
