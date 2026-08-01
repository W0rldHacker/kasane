# Requirements traceability and release evidence

Baseline: [requirements](./requirements.md) · [scope](./scope.md) ·
[assumptions](./assumptions.md) · **traceability**

## Rules

- Every `P0` and `P1` requirement MUST have at least one owner task and one
  test suite in the matrix below.
- A task ID names future implementation ownership; it does not mean the
  requirement is already implemented.
- A suite is acceptable evidence only when it runs in required CI against the
  exact commit or packed artifact named by the gate.
- `P2` and `P3` rows are tracked separately and MUST NOT satisfy core coverage.
- Release status values are `planned`, `implemented`, `tested`, `accepted`, or
  `deferred`. This baseline starts at `planned`.

## Test-suite registry

| Suite ID | Intended evidence | Future command or location | Primary owner |
| --- | --- | --- | --- |
| `TS-ARCH` | Dependency direction, no forbidden exports/masking/singletons | `pnpm test:architecture` | `ARCH-001`, `ARCH-002` |
| `TS-NORMALIZE` | ConfigNode acceptance, detachment, undefined, cycles, dangerous keys, limits | `pnpm test:unit -- normalize`; `pnpm test:security -- normalize` | `MODEL-001`, `MODEL-002` |
| `TS-MERGE` | Normative decision table and built-in strategies/removal | `pnpm test:unit -- merge-semantics merge-strategies` | `MERGE-001`–`MERGE-003` |
| `TS-PROPERTY` | Determinism, no mutation, mode invariance, generated trees | `pnpm test:property` | `QA-003` |
| `TS-PROVENANCE` | Origins, histories, operations, modes, tombstones | `pnpm test:unit -- provenance-tree provenance-modes` | `PROV-001`, `PROV-002` |
| `TS-SNAPSHOT` | Paths, root kinds, freeze, isolation, explain, safe serialization | `pnpm test:unit -- snapshot paths explain` | `SNAP-001`, `SNAP-002` |
| `TS-SOURCES` | Layer pipeline, value/custom/file/env/secret, abort, collisions | `pnpm test:integration -- value-pipeline file env secret-layer` | `SRC-001`–`SRC-003`, `SEC-001` |
| `TS-VALIDATION` | Function/Standard Schema, transforms, issue provenance | `pnpm test:unit -- validation`; `pnpm test:integration -- validation` | `VAL-001`, `VAL-002` |
| `TS-REDACTION` | Canary across JSON, inspect, explain, history, errors, diff, events | `pnpm test:security -- redaction` | `SEC-002`, `QA-004` |
| `TS-DIFF` | Five change kinds, stable source identity, arrays, secrets | `pnpm test:unit -- diff`; `pnpm test:security -- diff` | `DIFF-001` |
| `TS-ERRORS` | Hierarchy, codes, safe details, cause sanitization | `pnpm test:unit -- errors`; `pnpm test:security -- errors` | `ERR-001` |
| `TS-TYPES` | Inference, readonly API, absence of typed paths/private leaks | `pnpm test:types`; `pnpm api:check` | `TYPE-001`, `QA-005` |
| `TS-PACKAGE` | ESM exports, dependency/tarball hygiene, real consumers | `pnpm pack:check`; `pnpm test:package`; `pnpm test:consumer:packed` | `PKG-001`, `REL-002`, `QA-005` |
| `TS-SECURITY` | Fuzz corpus, resource limits, prototype pollution, abort, canaries | `pnpm test:security`; `pnpm test:fuzz` | `SEC-004`, `QA-004` |
| `TS-PLATFORM` | Node 22/24 on Linux, macOS, Windows | required CI matrix | `QA-006`, `CI-001` |
| `TS-PERF` | Published latency/throughput/memory budgets | `pnpm bench`; `pnpm bench:ci` | `PERF-001` |
| `TS-DOCS` | Baseline consistency, links, API drift, doctests, examples | `pnpm docs:check`; `pnpm lint:markdown`; `pnpm examples:test` | `DOC-001`–`DOC-003` |
| `TS-POLICY` | Security policy and private-disclosure tabletop | `pnpm security:policy-check` | `SEC-005` |
| `TS-RELEASE` | Gate checklist, artifact identity, provenance, smoke tests, stable maintenance tabletop | `pnpm verify`; `pnpm release:rehearse`; `pnpm maintenance:check`; `pnpm maintenance:tabletop`; release records | `REL-001`–`REL-006`, `MAINT-001` |
| `TS-COMPANION` | Public source/parser contracts, failure, abort, secrets, dangerous keys, no source-owned merge, package isolation | `pnpm --filter @worldhacker/kasane-source-testkit test`; `pnpm companion:verify`; `pnpm -r pack:check` | `POST-001` |
| `TS-WATCH` | New snapshots, explicit acceptance, debounce, errors, abort, optional deletion/recreation, secret diff, native platform events | `pnpm --filter @worldhacker/kasane-watch test`; required Windows CI | `POST-002` |
| `TS-CLI` | Missing paths, invalid config, versioned JSON, secret explain/print/diff, public imports, no reveal flag, Windows shell | `pnpm --filter @worldhacker/kasane-cli test`; `pnpm companion:policy-check` | `POST-003` |
| `TS-ABSENCE` | No non-goal/post-1.0 export, dependency, or tarball content | API report plus packed allowlist tests | `TYPE-001`, `PKG-001`, `REL-002` |

## Mandatory `1.0` coverage matrix

| Requirement | Priority | Owner tasks | Test suites | Release gate | RC status |
| --- | --- | --- | --- | --- | --- |
| `REQ-CORE-001` | `P0` | `ARCH-001`, `SRC-001`, `QA-002` | `TS-ARCH`, `TS-SOURCES` | Foundation → MVP | `accepted` |
| `REQ-CORE-002` | `P1` | `ARCH-001`, `TYPE-001`, `PKG-001`, `REL-002` | `TS-ARCH`, `TS-PACKAGE`, `TS-ABSENCE` | Beta → RC | `accepted` |
| `REQ-DATA-001` | `P0` | `MODEL-001`, `MERGE-001`, `SNAP-001`, `QA-001` | `TS-NORMALIZE`, `TS-MERGE`, `TS-SNAPSHOT` | Foundation → MVP | `accepted` |
| `REQ-DATA-002` | `P0` | `MODEL-001`, `QA-001`, `QA-004` | `TS-NORMALIZE`, `TS-SECURITY` | Foundation → MVP | `accepted` |
| `REQ-DATA-003` | `P0` | `MODEL-001`, `MERGE-001`, `QA-003` | `TS-NORMALIZE`, `TS-MERGE`, `TS-PROPERTY` | Foundation → MVP | `accepted` |
| `REQ-SNAP-001` | `P1` | `SNAP-001`, `QA-001`, `QA-002` | `TS-SNAPSHOT`, `TS-SOURCES` | Foundation → MVP | `accepted` |
| `REQ-MERGE-001` | `P0` | `MERGE-001`, `MERGE-002`, `QA-001`, `QA-003` | `TS-MERGE`, `TS-PROPERTY` | Foundation → MVP | `accepted` |
| `REQ-MERGE-002` | `P0` | `MERGE-001`, `MERGE-003`, `QA-001`, `QA-003` | `TS-MERGE`, `TS-PROPERTY` | Foundation → MVP | `accepted` |
| `REQ-MERGE-003` | `P0` | `ARCH-002`, `MERGE-003`, `PROV-001`, `QA-001` | `TS-MERGE`, `TS-PROVENANCE`, `TS-SNAPSHOT` | Foundation → MVP | `accepted` |
| `REQ-MERGE-004` | `P0` | `ARCH-001`, `MERGE-002`, `PROV-001`, `QA-001` | `TS-ARCH`, `TS-MERGE`, `TS-PROVENANCE` | Foundation → MVP | `accepted` |
| `REQ-PROV-001` | `P0` | `PROV-002`, `SNAP-002`, `QA-001` | `TS-PROVENANCE`, `TS-PROPERTY` | Foundation → MVP | `accepted` |
| `REQ-PROV-002` | `P1` | `PROV-001`, `PROV-002`, `SNAP-002`, `QA-001` | `TS-PROVENANCE`, `TS-SNAPSHOT` | MVP → Alpha | `accepted` |
| `REQ-PROV-003` | `P1` | `PROV-001`, `SEC-001`, `QA-004` | `TS-PROVENANCE`, `TS-REDACTION` | MVP → Alpha | `accepted` |
| `REQ-PATH-001` | `P0` | `ARCH-002`, `SNAP-001`, `QA-001` | `TS-SNAPSHOT` | Foundation → MVP | `accepted` |
| `REQ-PATH-002` | `P1` | `SNAP-001`, `SNAP-002`, `ERR-001`, `QA-001` | `TS-SNAPSHOT`, `TS-ERRORS` | Foundation → MVP | `accepted` |
| `REQ-SNAP-002` | `P0` | `ARCH-002`, `SNAP-001`, `SEC-002`, `QA-004` | `TS-SNAPSHOT`, `TS-REDACTION` | MVP → Alpha | `accepted` |
| `REQ-ERR-001` | `P1` | `ERR-001`, `VAL-002`, `SEC-004`, `QA-001`, `QA-004` | `TS-ERRORS`, `TS-SECURITY` | MVP → Alpha | `accepted` |
| `REQ-SRC-001` | `P0` | `ARCH-001`, `SRC-001`, `MODEL-001`, `QA-002` | `TS-ARCH`, `TS-SOURCES`, `TS-NORMALIZE` | Foundation → MVP | `accepted` |
| `REQ-SRC-002` | `P1` | `SRC-002`, `MODEL-001`, `QA-002`, `QA-006` | `TS-SOURCES`, `TS-PLATFORM` | MVP → Alpha | `accepted` |
| `REQ-SRC-003` | `P0` | `SRC-003`, `DOC-002`, `QA-002`, `QA-006` | `TS-SOURCES`, `TS-PLATFORM`, `TS-DOCS` | MVP → Alpha | `accepted` |
| `REQ-SRC-004` | `P1` | `SRC-003`, `PROV-001`, `QA-002`, `QA-004` | `TS-SOURCES`, `TS-SECURITY` | MVP → Alpha | `accepted` |
| `REQ-SRC-005` | `P1` | `SRC-001`, `SRC-002`, `SRC-003`, `SEC-001`, `REL-002`, `QA-002` | `TS-SOURCES`, `TS-PACKAGE`, `TS-ABSENCE` | MVP → Alpha | `accepted` |
| `REQ-VAL-001` | `P1` | `VAL-001`, `TYPE-001`, `QA-001`, `QA-005` | `TS-VALIDATION`, `TS-TYPES`, `TS-PACKAGE` | MVP → Alpha | `accepted` |
| `REQ-VAL-002` | `P0` | `ARCH-002`, `VAL-001`, `SEC-001`, `QA-001`, `QA-004` | `TS-VALIDATION`, `TS-NORMALIZE`, `TS-REDACTION` | MVP → Alpha | `accepted` |
| `REQ-VAL-003` | `P1` | `VAL-002`, `SEC-002`, `QA-002`, `QA-004` | `TS-VALIDATION`, `TS-REDACTION` | MVP → Alpha | `accepted` |
| `REQ-SEC-001` | `P0` | `MODEL-002`, `SEC-004`, `QA-004` | `TS-NORMALIZE`, `TS-SECURITY` | Foundation → MVP | `accepted` |
| `REQ-SEC-002` | `P0` | `SEC-001`, `QA-004` | `TS-SOURCES`, `TS-PROVENANCE`, `TS-REDACTION` | MVP → Alpha | `accepted` |
| `REQ-SEC-003` | `P0` | `SEC-002`, `SEC-004`, `QA-004` | `TS-REDACTION`, `TS-ARCH`, `TS-SECURITY` | MVP → Alpha | `accepted` |
| `REQ-SEC-004` | `P1` | `SEC-003`, `SEC-005`, `QA-004` | `TS-REDACTION`, `TS-DIFF`, `TS-SECURITY` | Alpha → Beta | `accepted` |
| `REQ-SEC-005` | `P1` | `SEC-004`, `QA-004`, `DOC-002` | `TS-SECURITY`, `TS-ERRORS`, `TS-DOCS` | Alpha → Beta | `accepted` |
| `REQ-DIFF-001` | `P1` | `DIFF-001`, `QA-001`, `QA-002` | `TS-DIFF` | MVP → Alpha | `accepted` |
| `REQ-DIFF-002` | `P1` | `DIFF-001`, `SEC-003`, `QA-004` | `TS-DIFF`, `TS-REDACTION` | MVP → Alpha | `accepted` |
| `REQ-TYPE-001` | `P1` | `TYPE-001`, `QA-005` | `TS-TYPES`, `TS-PACKAGE` | Alpha → Beta | `accepted` |
| `REQ-TYPE-002` | `P1` | `TYPE-001`, `QA-005`, `POST-004` | `TS-TYPES`, `TS-ABSENCE` | Alpha → Beta | `accepted` |
| `REQ-PKG-001` | `P0` | `PKG-001`, `QA-005`, `QA-006`, `REL-002` | `TS-PACKAGE`, `TS-PLATFORM`, `TS-ABSENCE` | MVP → Alpha | `accepted` |
| `REQ-PKG-002` | `P1` | `FOUND-002`, `PKG-001`, `REL-002`, `SEC-004` | `TS-PACKAGE`, `TS-ABSENCE` | Beta → RC | `accepted` |
| `REQ-QUAL-001` | `P1` | `QA-001`–`QA-005`, `CI-001` | `TS-PROPERTY`, `TS-SECURITY`, `TS-TYPES`, `TS-PACKAGE` | Beta → RC | `accepted` |
| `REQ-QUAL-002` | `P1` | `QA-001`, `QA-006`, `CI-001` | `TS-PLATFORM`, `TS-SECURITY` | Beta → RC | `accepted` |
| `REQ-QUAL-003` | `P1` | `PERF-001`, `PERF-002`, `QA-003`, `QA-004` | `TS-PERF`, `TS-PROPERTY`, `TS-SECURITY` | Alpha → Beta | `accepted` |
| `REQ-DOC-001` | `P1` | `DOC-001`, `DOC-002`, `DOC-003`, `QA-002` | `TS-DOCS`, `TS-PACKAGE` | Alpha → Beta | `accepted` |
| `REQ-SEC-006` | `P1` | `SEC-005`, `REL-002`, `QA-004` | `TS-POLICY`, `TS-PACKAGE`, `TS-SECURITY` | Alpha → Beta | `accepted` |
| `REQ-REL-001` | `P1` | `REL-001`, `REL-003`–`REL-006`, `MAINT-001` | `TS-RELEASE` | RC → 1.0 | `accepted` |
| `REQ-REL-002` | `P1` | `REL-002`, `REL-005`, `REL-006`, `CI-001` | `TS-PACKAGE`, `TS-RELEASE` | RC → 1.0 | `accepted` |

## Optional and post-1.0 tracking

| Requirement | Class | Owner | Evidence | Core gate status |
| --- | --- | --- | --- | --- |
| `REQ-OPT-001` | `optional recommendation` | `OBS-001` | Event unit/security suites if shipped | Excluded |
| `REQ-OPT-002` | `optional recommendation` | `PERF-002` | Before/after benchmark if performed | Excluded |
| `REQ-POST-001` | `post-1.0` | `POST-002` | `TS-WATCH`; `TS-ABSENCE` for core | Implemented outside core |
| `REQ-POST-002` | `post-1.0` | `POST-003` | `TS-CLI`; `TS-ABSENCE` for core | Implemented outside core |
| `REQ-POST-003` | `post-1.0` | `POST-001` | `TS-COMPANION`; `TS-ABSENCE` for core | Implemented outside core |
| `REQ-POST-004` | `post-1.0` | `POST-004` | Future RFC-specific suites; `TS-ABSENCE` for core | Excluded |

## Normative release gates

### Foundation → MVP

- All normative baseline documents and required ADRs are accepted.
- Unsafe types, dangerous keys, cycles, and limit violations fail before merge.
- The full merge decision table, no-mutation properties, current provenance,
  value pipeline, path API, origin, and explain suites are green.
- The property suite runs at least 10,000 cases in CI.
- No open `P0` defect exists in normalize, merge, provenance, or snapshot.

### MVP → Alpha

- All built-in sources and custom `LayerSource` work through the common
  sequential pipeline.
- All merge strategies, removal, both validation adapters, provenance-enriched
  validation errors, centralized redaction, and five-way diff are implemented.
- ESM packed consumers pass Node 22 and 24; security/fuzz, tarball allowlist,
  and secret scan are green.
- Alpha is published only under a prerelease dist-tag, never `latest`.

### Alpha → Beta

- Every `P1` functional requirement is implemented and the public API/options
  have formal review.
- There are no open `P0` defects; every `P1` defect has a before-beta outcome.
- Required OS/Node, type, packed-consumer, and performance gates are green.
- README, examples, merge semantics, and security model are feature-complete;
  at least two alpha consumer projects have upgraded successfully.
- Private disclosure is active and no new `P2` feature enters beta scope.

### Beta → Release Candidate

- There are no open `P0` or `P1` defects and API freeze is active.
- Every mandatory matrix row is at least `tested`; coverage reaches 95%
  lines/functions, 90% branches, and 100% for redaction/dangerous-key branches.
- Nightly property/fuzz results have no unreconciled failure.
- The exact packed artifact passes publint, attw, consumers, allowlist, and
  secret scan on the required platform matrix.
- Changelog, migration, SemVer, Node support, release dry-run, and rollback
  rehearsal are complete; post-beta breaking fixes are documented.

### Release Candidate → `1.0`

- The exact RC commit passes full required CI and a seven-day soak or documented
  equivalent. Any code change forces a new RC.
- Final security audit and threat-model sign-off are complete with no known
  secret leak, prototype pollution, uncontrolled resource path, or packaging
  defect.
- Trusted publishing and npm provenance are verified; the rehearsed artifact is
  identical to stable except version metadata.
- A new participant completes quick start without author help.
- Every mandatory matrix row is `accepted`, the release manager signs the
  Definition of Done, and the post-publish smoke test succeeds.

## Security owner audit

Every security requirement has at least one `P1`-or-higher owner task and a
security suite. `P0` is stronger than `P1` for this audit.

| Requirement | P1-or-higher owner tasks | Security evidence |
| --- | --- | --- |
| `REQ-SEC-001` | `MODEL-002` (`P0`), `SEC-004` (`P0`), `QA-004` (`P0`) | `TS-NORMALIZE`, `TS-SECURITY` |
| `REQ-SEC-002` | `SEC-001` (`P0`), `QA-004` (`P0`) | `TS-REDACTION`, `TS-SECURITY` |
| `REQ-SEC-003` | `SEC-002` (`P0`), `SEC-004` (`P0`), `QA-004` (`P0`) | `TS-REDACTION`, `TS-SECURITY` |
| `REQ-SEC-004` | `SEC-003` (`P1`), `SEC-005` (`P0`), `QA-004` (`P0`) | `TS-REDACTION`, `TS-DIFF`, `TS-SECURITY` |
| `REQ-SEC-005` | `SEC-004` (`P0`), `QA-004` (`P0`), `DOC-002` (`P1`) | `TS-SECURITY`, `TS-ERRORS` |
| `REQ-SEC-006` | `SEC-005` (`P0`), `REL-002` (`P0`), `QA-004` (`P0`) | `TS-POLICY`, `TS-PACKAGE`, `TS-SECURITY` |

## Automated baseline checks

`pnpm docs:check` enforces:

1. unique `REQ-*`, `DEC-*`, `ASM-*`, `NG-*`, and suite IDs;
2. every `P0`/`P1` requirement appears exactly once in the mandatory matrix;
3. every mandatory row has a known task and known suite;
4. every `REQ-SEC-*` row appears in the security owner audit;
5. no `REQ-POST-*` or `REQ-OPT-*` row appears in a core release gate;
6. every mandatory row uses canonical owner-task and test-suite IDs;
7. all four baseline files link to one another and all documentation-local
   links resolve;
8. user snippets import only shipped public exports, and both API maps name
   every root and Standard Schema export;
9. README doctests match their executable example source exactly;
10. documented merge matrices match the same fixture as the unit suite;
11. documented public option defaults match the generated table and their
    implementation evidence;
12. the ADR index has exactly one matching `Accepted` or `Superseded` status for
    every numbered record.

`FOUND-002` provides this structural gate. The baseline statuses remained
`planned` until their owner tasks and linked suites passed. All mandatory rows
are now `accepted` against the immutable `1.0.0-rc.1` evidence; optional and
post-1.0 rows retain their independent status.

## Release sign-off

At RC, maintainers MUST change a mandatory requirement to `accepted` only after
its owner task is complete and linked suites are green on the exact candidate.
The release manager MUST reject `1.0.0` if any mandatory row is missing,
`planned`, merely `implemented`, or lacks durable test evidence.
