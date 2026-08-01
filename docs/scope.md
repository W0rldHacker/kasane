# Scope for `@worldhacker/kasane@1.0.0`

Baseline: [requirements](./requirements.md) · **scope** ·
[assumptions](./assumptions.md) · [traceability](./traceability.md)

## Normative boundary

The stable package is a small ESM-only Node.js library that turns explicitly
ordered named configuration layers into an immutable, validated snapshot with
first-class provenance and security-aware diagnostics.

The mandatory `1.0` core contains:

- sequential named layers and the provider-neutral `LayerSource` contract;
- `value`, JSON `file`, `env`, and `secret` sources;
- safe normalization to `ConfigNode` and enforced resource limits;
- deterministic built-in merge operations and explicit removal;
- `none`, `origin-only`, and `full` provenance modes;
- immutable snapshots and the string path API;
- function and structural Standard Schema validation;
- secret annotations, centralized redaction, and fingerprints;
- source-aware snapshot diff and safe errors;
- TypeScript declarations, ESM packaging, tests, documentation, and release
  hardening.

The requirement-level definition is in `requirements.md`; release evidence is
in `traceability.md`.

Source aliases such as `SPEC`, `ARCH`, `BACKLOG`, and `MATRIX` are defined in
the source registry in [requirements.md](./requirements.md).

## Public surface boundary

Stable exports are limited to `@worldhacker/kasane` and
`@worldhacker/kasane/standard-schema`. Deep
imports and `internal`, `watch`, CLI, provider, or format subpaths are outside
the `1.0` contract. Exact signatures remain owned by `TYPE-001` and `PKG-001`;
this baseline fixes capability boundaries, not internal classes.

## Optional recommendations

| ID | Capability | `1.0` status | Owner |
| --- | --- | --- | --- |
| `OPT-001` | Safe local lifecycle events | `P2`; may ship, but is not a core release blocker | `OBS-001` |
| `OPT-002` | Measured hotspot optimization beyond approved budgets | `P2`; only with benchmark evidence | `PERF-002` |

Omitting an optional recommendation is not a missing core requirement. Adding
one does not permit a release gate to depend on it without an ADR and baseline
update.

## Post-1.0 capabilities

| ID | Capability | Required placement | Owner |
| --- | --- | --- | --- |
| `POST-001` | YAML, TOML, Vault, cloud, Kubernetes, and other provider integrations | Companion packages over public source contracts | `POST-001` |
| `POST-002` | Watch/hot reload | Snapshot-based companion package | `POST-002` |
| `POST-003` | CLI diagnostics | Separate package/binary with the same redaction guarantees | `POST-003` |
| `POST-004` | Typed paths, OpenTelemetry, advanced codecs/merge extensions | RFC-led experimental or companion work | `POST-004` |

These capabilities MUST NOT be advertised as core, included in stable root
exports, or used to pass a `1.0` release gate.

POST-004 research is indexed in [`rfcs/`](../rfcs/README.md). Its private
prototype package is removable, creates no stable export, and remains blocked
from promotion until the RFC evidence gate is satisfied.

## Explicit non-goals

| ID | Non-goal | Source | Enforcement and future task |
| --- | --- | --- | --- |
| `NG-001` | Dependency injection container or application framework | SPEC §3.2, §28 | Public API absence check; `ARCH-001`, `TYPE-001` |
| `NG-002` | Secret manager or built-in Vault/cloud/Kubernetes client | SPEC §3.2, §28 | Dependency/export absence check; `PKG-001`, `REL-002`, future `POST-001` |
| `NG-003` | Proprietary schema DSL or mandatory schema package | SPEC §3.2, §10 | API/dependency absence check; `VAL-001`, `PKG-001` |
| `NG-004` | New config format, built-in support for every format, or JavaScript config execution | SPEC §3.2, §9.2, §28 | File-source and dependency tests; `SRC-002`, future `POST-001` |
| `NG-005` | Global mutable singleton or mutation of an existing snapshot | SPEC §3.2, §13–14, §28 | API absence and immutability tests; `SNAP-001`, `ARCH-001` |
| `NG-006` | Feature-flag platform or infrastructure/deployment policy engine | SPEC §3.2 | Public API absence check; `ARCH-001`, `TYPE-001` |
| `NG-007` | Remote synchronization, polling, retry platform, or automatic application of reloads in core | SPEC §3.2, §14, §28 | Core export/behavior absence check; future `POST-002`, `POST-004` |
| `NG-008` | CLI in the core package | SPEC §37; ARCH §A | Export/tarball absence check; `PKG-001`, future `POST-003` |
| `NG-009` | Arbitrary merge callbacks, computed-value dependency graphs, array deduplication, or wildcard merge rules | SPEC §8.2, §28; BACKLOG `MERGE-001`, `MERGE-003` | Strategy/API absence tests; `MERGE-001`, `QA-005` |
| `NG-010` | Recursive typed string paths in the stable core API | SPEC §16.3, §37 | Type/API absence tests; `TYPE-001`, future `POST-004` |
| `NG-011` | OpenTelemetry, `diagnostics_channel`, or global event publication in core | SPEC §20, §37; BACKLOG `OBS-001` | Dependency/export absence checks; `OBS-001`, future `POST-004` |
| `NG-012` | Sandboxing arbitrary JavaScript from custom sources, parsers, validators, or Proxies | BACKLOG `SEC-004`, `SEC-005` | Security documentation check; `SEC-004`, `SEC-005` |
| `NG-013` | A simple diagnostic or CLI switch that prints raw secrets | MATRIX §I; BACKLOG `SEC-002`, `POST-003` | Security/API absence tests; `SEC-002`, future `POST-003` |

## Scope-change policy

Non-goals and post-`1.0` placement MUST NOT change silently. A proposed change
requires all of the following before implementation:

1. an accepted ADR describing user demand, compatibility, security, supply
   chain, performance, and provenance impact;
2. updated requirement classification, priorities, and release criteria;
3. updated traceability with owner tasks and test suites;
4. an explicit decision whether the capability is core, experimental, or a
   companion package.

Examples, roadmap ideas, and optional recommendations are not authorization to
expand the stable contract.

## Release scope check

At RC, the public export report, packed tarball, runtime dependency audit, and
documentation MUST demonstrate that watch, CLI, provider integrations,
YAML/TOML packages, typed paths, and OpenTelemetry are absent from core. A
failure is a `P1` scope defect, not documentation debt.
