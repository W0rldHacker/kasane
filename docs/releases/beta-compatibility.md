# Beta compatibility and gate report

Status: pre-publication review complete; registry evidence is added after the
protected beta workflow.

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
