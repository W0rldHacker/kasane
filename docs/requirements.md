# Normative requirements for `kasane@1.0.0`

Baseline: **requirements** · [scope](./scope.md) ·
[assumptions](./assumptions.md) · [traceability](./traceability.md)

## Status and use

This document is the normative product baseline for `kasane@1.0.0`. PR reviews
and release gates MUST use the requirement IDs below. Descriptive examples in
the source documents are informative unless a row in this document promotes
them to a requirement.

Normative words `MUST`, `MUST NOT`, `SHOULD`, and `MAY` are used in their usual
RFC sense. A requirement can change only through an accepted ADR that updates
this document, `scope.md`, `assumptions.md`, and `traceability.md` together.

## Classification and priority

| Classification | Meaning |
| --- | --- |
| `explicit` | Directly required by the product specification or backlog. |
| `inferred implementation decision` | Resolves an ambiguity needed for one deterministic public contract. |
| `optional recommendation` | Useful for `1.0`, but not a release blocker and not core. |
| `post-1.0` | Explicitly excluded from the `1.0` core and release gates. |

| Priority | Meaning |
| --- | --- |
| `P0` | The decision blocks implementation or a safe prerelease. |
| `P1` | Mandatory for the stable `1.0` release. |
| `P2` | Optional recommendation; omission does not block `1.0`. |
| `P3` | Post-`1.0` work; MUST NOT be represented as core `1.0`. |

## Source registry

| Alias | Source |
| --- | --- |
| `SPEC` | Internal descriptive product specification; intentionally not distributed. |
| `ARCH` | Internal product architecture source; intentionally not distributed. |
| `BACKLOG` | Internal task backlog; intentionally not distributed. |
| `MATRIX` | Internal dependency and coverage source; intentionally not distributed. |

Section references below identify the source of the contract. `Verification`
states an observable result, not an implementation technique. Test-suite IDs
are defined and audited in `traceability.md`.

## Product and data model

| ID | Class | Priority | Normative requirement | Source | Verification | Owner tasks |
| --- | --- | --- | --- | --- | --- | --- |
| `REQ-CORE-001` | `explicit` | `P0` | Layers MUST have non-empty unique names, MUST be loaded strictly sequentially in array order, and later layers MUST have higher priority. No other priority mechanism is allowed. | SPEC §6.1; ARCH §A–B; BACKLOG `ARCH-001`, `SRC-001` | Integration fixtures prove order, pre-I/O duplicate rejection, and absence of parallel loading. | `ARCH-001`, `SRC-001`, `QA-002` |
| `REQ-CORE-002` | `explicit` | `P1` | Core MUST remain provider-neutral and limited to loading, normalization, merge/provenance, validation, snapshots, diagnostics, and diff. | SPEC §3, §28, §37; ARCH §A | Public export and dependency audits find no framework, provider SDK, schema DSL, or global registry. | `ARCH-001`, `TYPE-001`, `PKG-001`, `REL-002` |
| `REQ-DATA-001` | `inferred implementation decision` | `P0` | A root value MAY be any `ConfigNode`: `null`, boolean, finite number, string, dense array, or plain object. Root is not restricted to an object. | BACKLOG `FOUND-001`, `MODEL-001`; ARCH §B “Внутренняя модель значений” | Normalization, merge, validation, snapshot, and path tests cover every root kind. | `MODEL-001`, `MERGE-001`, `SNAP-001`, `QA-001` |
| `REQ-DATA-002` | `explicit` | `P0` | Accepted data MUST be detached plain data. Finite numbers, strings, booleans, `null`, dense arrays, and objects with `Object.prototype` or `null` prototype are accepted; unsupported types, accessors, symbols, non-enumerable properties, sparse arrays, non-finite numbers, and class instances are rejected without invoking getters. `-0` normalizes to `0`. | SPEC §18.5; BACKLOG `MODEL-001`; ARCH §B | Table-driven normalization tests cover every accepted and rejected category and prove no shared mutable references or getter calls. | `MODEL-001`, `QA-001`, `QA-004` |
| `REQ-DATA-003` | `explicit` | `P0` | An object property whose value is `undefined` MUST be a no-op; root `undefined` MUST be an empty/no-op layer; `undefined`, holes, and `remove` inside arrays MUST be rejected. `null` MUST remain an explicit value. | SPEC §8.1, §31; BACKLOG `MODEL-001`, `MERGE-001` | Unit and property tests distinguish `undefined`, absent, `null`, and invalid array content. | `MODEL-001`, `MERGE-001`, `QA-003` |
| `REQ-SNAP-001` | `explicit` | `P1` | A successful load MUST return a new immutable snapshot whose public data is isolated from inputs and internals. Deep freeze MUST default to enabled; `freeze: false` MAY weaken runtime freeze only. | SPEC §6.2, §13; ARCH §B; MATRIX §H | Mutation and reference-isolation tests pass for freeze on/off and for nested values. | `SNAP-001`, `QA-001`, `QA-002` |

## Merge and provenance

| ID | Class | Priority | Normative requirement | Source | Verification | Owner tasks |
| --- | --- | --- | --- | --- | --- | --- |
| `REQ-MERGE-001` | `explicit` | `P0` | Merge MUST be deterministic and MUST NOT mutate inputs. Default object/object is recursive merge; every other defined type combination is replacement; arrays replace; `null` replaces; `undefined` is resolved as a no-op before rules. | SPEC §8, §31; BACKLOG `MERGE-001`, `MERGE-002` | The complete decision-table fixture and generated-tree properties produce one result or specified error per combination. | `MERGE-001`, `MERGE-002`, `QA-001`, `QA-003` |
| `REQ-MERGE-002` | `explicit` | `P0` | The only `1.0` strategies MUST be `replace`, `merge`, `append`, and `prepend`. Rules MUST use exact canonical paths. `merge` requires object/object; `append` and `prepend` require array/array and MUST NOT deduplicate. Duplicate canonical rules MUST fail at startup. | SPEC §8.2; BACKLOG `MERGE-001`, `MERGE-003` | Strategy matrix covers valid/invalid types, escaped paths, duplicate rules, empty arrays, and index remapping. | `MERGE-001`, `MERGE-003`, `QA-001`, `QA-003` |
| `REQ-MERGE-003` | `inferred implementation decision` | `P0` | `remove` MUST be a marker operation, not a string rule. Removing an existing or root value removes it from materialized output. Removing an absent path MUST succeed as a value no-op and create a diagnostics-only tombstone; repeated removal remains deterministic. | SPEC §8.1; BACKLOG `ARCH-002`, `MERGE-003`; decision `DEC-010` | Existing, absent, root, repeated, and secret removal fixtures assert output and tombstone behavior. | `ARCH-002`, `MERGE-003`, `PROV-001`, `QA-001` |
| `REQ-MERGE-004` | `explicit` | `P0` | Value and provenance MUST be updated atomically in the same merge control flow; provenance MUST NOT be reconstructed from the final value. | ARCH §A–B; BACKLOG `ARCH-001`, `MERGE-002` | Architecture tests and mixed-origin fixtures prove aligned value/origin after set, replace, merge, append, prepend, and remove. | `ARCH-001`, `MERGE-002`, `PROV-001`, `QA-001` |
| `REQ-PROV-001` | `inferred implementation decision` | `P0` | Provenance modes MUST be `none`, `origin-only`, and `full`; `origin-only` MUST be the default. Mode MUST NOT change the final value. `none` MUST NOT build a hidden provenance tree. | SPEC §19; ARCH §B; BACKLOG `FOUND-001`, `PROV-002`; decision `DEC-002` | Identical layer fixtures produce identical values in all modes and mode-appropriate metadata. | `PROV-002`, `SNAP-002`, `QA-001` |
| `REQ-PROV-002` | `explicit` | `P1` | Current origin MUST be available for every resulting leaf when provenance is enabled. `full` MUST preserve affected-path history in actual layer order; `origin-only` MUST NOT retain prior values; `undefined` no-ops MUST NOT enter history. | SPEC §6.3, §37; BACKLOG `PROV-001`, `PROV-002` | Origin/history tests cover mixed objects, subtree replacement, arrays, removal, and no-op entries. | `PROV-001`, `PROV-002`, `SNAP-002`, `QA-001` |
| `REQ-PROV-003` | `explicit` | `P1` | Provenance metadata MUST use safe source references and MUST NOT contain configuration plaintext. Removed paths MAY retain tombstones but not current values. | SPEC §11.4; BACKLOG `PROV-001`, `SEC-001` | Metadata walk and secret canary tests find no raw value and correctly resolve tombstones. | `PROV-001`, `SEC-001`, `QA-004` |

## Paths, snapshot, and diagnostics

| ID | Class | Priority | Normative requirement | Source | Verification | Owner tasks |
| --- | --- | --- | --- | --- | --- | --- |
| `REQ-PATH-001` | `inferred implementation decision` | `P0` | Paths MUST use dot notation; `\.` escapes a dot, `\\` escapes a backslash, decimal unsigned segments address array indices, empty intermediate segments are invalid, and `''` denotes the root. | ARCH §B; BACKLOG `FOUND-001`, `ARCH-002`; decision `DEC-005` | Parser fixtures cover escaped dots/backslashes, array indices, root, malformed escapes, signs, and empty segments. | `ARCH-002`, `SNAP-001`, `QA-001` |
| `REQ-PATH-002` | `explicit` | `P1` | `get` MUST return `undefined` for missing paths, `has` MUST report existence, `require` MUST throw `KasanePathError`, `origin` MUST return current origin or `undefined`, and `explain` MUST safely distinguish found, missing, and removed paths. All methods MUST support `''`. | SPEC §7, §17.4, §37; BACKLOG `SNAP-001`, `SNAP-002` | Shared path fixtures assert consistent results across all five methods for root, leaf, container, missing, and removed paths. | `SNAP-001`, `SNAP-002`, `ERR-001`, `QA-001` |
| `REQ-SNAP-002` | `inferred implementation decision` | `P0` | `snapshot.value` MUST be the only intentionally raw public value surface. `toJSON()` and custom inspect MUST return detached centrally redacted representations and MUST never expose an internal reference. | SPEC §9.4, §11.5; ARCH §B; BACKLOG `ARCH-002`, `SNAP-001`, `SEC-002`; decision `DEC-006` | `JSON.stringify`, direct `toJSON`, inspect, mutation, and canary tests prove safe detached output while raw access remains documented. | `ARCH-002`, `SNAP-001`, `SEC-002`, `QA-004` |
| `REQ-ERR-001` | `explicit` | `P1` | Public failures MUST use a stable `KasaneError` hierarchy and error codes. Messages/details MUST include safe path, layer, and source context where available and MUST NOT include configuration values or arbitrary raw causes. | SPEC §17; ARCH §B; BACKLOG `ERR-001`, `ARCH-002` | Error contract tests assert codes, `instanceof`, serialization, safe context, and cause sanitization. | `ERR-001`, `VAL-002`, `SEC-004`, `QA-001`, `QA-004` |

## Sources and validation

| ID | Class | Priority | Normative requirement | Source | Verification | Owner tasks |
| --- | --- | --- | --- | --- | --- | --- |
| `REQ-SRC-001` | `explicit` | `P0` | `value`, `file`, `env`, `secret`, and custom sources MUST use one provider-neutral `LayerSource` contract. A source MUST only load data, MUST NOT receive previous config or perform merge, and every result MUST be normalized before merge. Custom source code is trusted; its returned data is untrusted. | SPEC §9.5; BACKLOG `ARCH-001`, `SRC-001`; decision `DEC-013` | Contract and architecture tests cover sync/async sources, rejection, abort, attempted previous-config access, and unsafe output. | `ARCH-001`, `SRC-001`, `MODEL-001`, `QA-002` |
| `REQ-SRC-002` | `explicit` | `P1` | `file` MUST resolve relative paths against one frozen `cwd`, read UTF-8, default to JSON, allow sync/async custom parsers, and pass parser output through normalization. `optional` MUST suppress only absence (`ENOENT`), never parse, permission, or directory errors. File contents MUST NOT enter diagnostics. | SPEC §9.2; BACKLOG `SRC-002` | Cross-platform file fixtures cover relative/absolute, optional missing, invalid JSON, permission, directory, async parser, abort, and unsafe output. | `SRC-002`, `MODEL-001`, `QA-002`, `QA-006` |
| `REQ-SRC-003` | `inferred implementation decision` | `P0` | `env` MUST snapshot its source at load, sort keys before mapping, default to separator `__`, default to lower-case path segments, and allow an explicit preserve-case option. `coerce: false` MUST be default and preserve strings; `coerce: 'json'` replaces only successfully parsed JSON literals. Explicit mapping is the recommended production mode. | SPEC §9.3; BACKLOG `SRC-003`; decision `DEC-008` | Env fixtures cover casing, Windows behavior, enumeration order, literals, empty strings, invalid JSON, and explicit maps. | `SRC-003`, `DOC-002`, `QA-002`, `QA-006` |
| `REQ-SRC-004` | `explicit` | `P1` | Env parent/child conflicts, duplicate target paths, case collisions, empty or dangerous segments MUST fail deterministically rather than choose by enumeration order. Every mapped leaf MUST retain the variable name as a safe source reference, never its value. | ARCH §A; BACKLOG `SRC-003` | Collision fixtures permute input order and assert the same safe error; provenance tests assert references. | `SRC-003`, `PROV-001`, `QA-002`, `QA-004` |
| `REQ-SRC-005` | `explicit` | `P1` | Built-in `value`, JSON `file`, `env`, and `secret` sources and the public custom source contract MUST ship in `1.0`. YAML/TOML and provider integrations MUST NOT be runtime requirements of core. | SPEC §9, §37; ARCH §A; MATRIX §F | Packed-consumer integration tests exercise each built-in and a custom source; export/dependency audit finds no provider parser. | `SRC-001`, `SRC-002`, `SRC-003`, `SEC-001`, `REL-002`, `QA-002` |
| `REQ-VAL-001` | `explicit` | `P1` | Validation MUST support sync/async function validators and structural Standard Schema `~standard` detection without a runtime dependency on a schema package. Kasane MUST NOT define a schema DSL. | SPEC §10; ARCH §B; BACKLOG `VAL-001` | Runtime mocks and type tests cover sync/async success/failure, Standard Schema, and absence of schema dependencies. | `VAL-001`, `TYPE-001`, `QA-001`, `QA-005` |
| `REQ-VAL-002` | `inferred implementation decision` | `P0` | A validator MUST receive a detached copy. Its result MUST be normalized again. Unchanged paths retain origin; changed existing paths retain origin plus `transformed: true`; added paths receive synthetic origin `validation`; removed paths receive validation tombstones. Secret path policy is reapplied after reconciliation. | ARCH §B; BACKLOG `ARCH-002`, `VAL-001`; decision `DEC-007` | Reconciliation fixtures cover coercion, default, removal, mutation attempts, unsafe output, and schema-transformed secrets. | `ARCH-002`, `VAL-001`, `SEC-001`, `QA-001`, `QA-004` |
| `REQ-VAL-003` | `explicit` | `P1` | Validation failures MUST expose normalized issue paths and safe current source context when resolvable. Received/previous secret values MUST remain redacted. | SPEC §10.3; BACKLOG `VAL-002` | Env/file/secret validation fixtures assert path/source enrichment, unmappable issues, and canary absence. | `VAL-002`, `SEC-002`, `QA-002`, `QA-004` |

## Security and diff

| ID | Class | Priority | Normative requirement | Source | Verification | Owner tasks |
| --- | --- | --- | --- | --- | --- | --- |
| `REQ-SEC-001` | `explicit` | `P0` | Normalization MUST reject `__proto__`, `prototype`, and `constructor` at every depth, cycles, and configured depth/node/string limits before unsafe allocation or merge. | SPEC §18; BACKLOG `MODEL-002`, `SEC-004` | Boundary ±1, prototype corpus, direct/indirect cycle, large-input, and fuzz tests fail safely. | `MODEL-002` (`P0`), `SEC-004` (`P0`), `QA-004` (`P0`) |
| `REQ-SEC-002` | `inferred implementation decision` | `P0` | Secret state MUST attach to each current/history value. Secret layers and `secretValue` mark subtrees; `*` matches exactly one segment and `**` is unsupported. A later public value clears value-level secret state, while prior history remains secret; an applicable path policy keeps the current value secret. | SPEC §11; ARCH §B; BACKLOG `SEC-001`; decision `DEC-009` | Secret transition fixtures cover public→secret, secret→public, partial override, wildcard policy, removal, and full history. | `SEC-001` (`P0`), `QA-004` (`P0`) |
| `REQ-SEC-003` | `explicit` | `P0` | One central Redactor MUST protect `explain`, diff, validation/source errors, history, inspect, `toJSON`, structured diagnostics, and lifecycle events. Secret plaintext MUST NOT be stored in diagnostic metadata. Ad-hoc masking is forbidden. | SPEC §11.4, §18.4; ARCH §B; BACKLOG `SEC-002`, `SEC-004` | A shared canary corpus and architecture rule cover every surface, mixed trees, ANSI/multiline strings, truncation, and public siblings. | `SEC-002` (`P0`), `SEC-004` (`P0`), `QA-004` (`P0`) |
| `REQ-SEC-004` | `explicit` | `P1` | Secret comparison metadata MUST use canonical SHA-256; when `fingerprintKey` is supplied it MUST use HMAC-SHA-256. Plaintext MUST NOT be retained, and fingerprinting MUST NOT be represented as password hashing. | ARCH §B; BACKLOG `SEC-003`, `SEC-005` | Canonical-order, type-boundary, keyed/unkeyed, known-vector, and metadata canary tests pass. | `SEC-003` (`P1`), `SEC-005` (`P0`), `QA-004` (`P0`) |
| `REQ-SEC-005` | `explicit` | `P1` | Public diagnostics, path caches, file reads, formatter traversal, source/validator outputs, and paths MUST have enforced resource bounds. Raw arbitrary `cause`, user-controlled `toString`, and partial snapshots after abort MUST be excluded. Proxy, custom source, and custom parser code MUST be documented as trusted executable code, not sandboxed. | SPEC §18; BACKLOG `ARCH-002`, `SEC-004` | Resource/fuzz tests cover file/output/path/format limits, malicious errors, abort, cache flooding, and truncation markers. | `SEC-004` (`P0`), `QA-004` (`P0`), `DOC-002` (`P1`) |
| `REQ-DIFF-001` | `explicit` | `P1` | Snapshot diff MUST distinguish exactly `added`, `removed`, `value-changed`, `source-changed`, and `value-and-source-changed`, including the same value from a different source, in deterministic path order. | SPEC §12; BACKLOG `DIFF-001` | Diff fixtures cover all five mutually exclusive change kinds and stable ordering. | `DIFF-001`, `QA-001`, `QA-002` |
| `REQ-DIFF-002` | `inferred implementation decision` | `P1` | Cross-snapshot sources MUST compare by stable safe identity, not numeric layer ID. Arrays are atomic in `1.0`. Secret outputs remain redacted. With provenance `none`, source changes MUST be reported unavailable rather than invented. | BACKLOG `DIFF-001`; MATRIX §H | Cross-registry, array, secret, and provenance-none fixtures assert classification and safe output. | `DIFF-001`, `SEC-003`, `QA-004` |

## TypeScript, packaging, quality, and release

| ID | Class | Priority | Normative requirement | Source | Verification | Owner tasks |
| --- | --- | --- | --- | --- | --- | --- |
| `REQ-TYPE-001` | `explicit` | `P1` | Validator output type MUST be inferred; without validation an explicit generic MUST be documented as a compile-time assertion only. `snapshot.value` and public models MUST be deeply readonly; `get` and `require` return `unknown`; declarations MUST expose neither `any`, private classes, nor dependencies. | SPEC §16; BACKLOG `TYPE-001` | Type fixtures cover schema/function inference, generic assertion, mutation errors, API report, and compile-time budget. | `TYPE-001`, `QA-005` |
| `REQ-TYPE-002` | `explicit` | `P1` | Stable core MUST use plain string paths and MUST NOT include recursive typed-path inference. | SPEC §16.3, §37; BACKLOG `TYPE-001`, `POST-004` | Type/API absence tests show `get(string): unknown` and no typed-path export. | `TYPE-001`, `QA-005`, `POST-004` |
| `REQ-PKG-001` | `inferred implementation decision` | `P0` | `1.0` MUST be ESM-only, built without bundling, and support Node.js `>=22`; required CI covers latest Node 22 and 24 patches. Stable exports MUST be only `kasane` and `kasane/standard-schema`; deep/internal/watch exports are forbidden. | ARCH §B; BACKLOG `FOUND-001`, `PKG-001`, `QA-006`; decision `DEC-003` | Packed consumers import every export on Node 22/24 and fail deep/CJS/watch imports; publint and attw pass. | `PKG-001`, `QA-005`, `QA-006`, `REL-002` |
| `REQ-PKG-002` | `inferred implementation decision` | `P1` | Zero runtime dependencies is the `1.0` target. Any exception MUST have an accepted supply-chain ADR and updated lockfile, license, security, and tarball audits. | SPEC §9.2, §32; ARCH §B; BACKLOG `FOUND-001`; decision `DEC-004` | Manifest/lock/tarball audit reports zero runtime dependencies or the required accepted exception record. | `FOUND-002`, `PKG-001`, `REL-002`, `SEC-004` |
| `REQ-QUAL-001` | `explicit` | `P1` | Unit, integration, property, security/fuzz, type-level, and packed-consumer suites MUST be green. Property runs MUST preserve failing seeds/minimized regressions. | SPEC §31–32; MATRIX §G–H; BACKLOG `QA-001`–`QA-005` | CI executes all named suites; required jobs and retained regression artifacts are auditable. | `QA-001`, `QA-002`, `QA-003`, `QA-004`, `QA-005`, `CI-001` |
| `REQ-QUAL-002` | `explicit` | `P1` | RC coverage MUST be at least 95% lines/functions and 90% branches; redaction and dangerous-key branches MUST reach 100%. Required cross-platform CI MUST cover Linux, macOS, and Windows on the supported Node matrix. | MATRIX §G–H; BACKLOG `QA-001`, `QA-006` | Coverage and CI matrix gates reject lower values or a missing required platform/runtime job. | `QA-001`, `QA-006`, `CI-001` |
| `REQ-QUAL-003` | `explicit` | `P1` | Published performance budgets MUST cover merge/provenance, freeze, validation reconciliation, redaction/fingerprint, and memory. Optimizations MUST NOT change semantics and require before/after evidence. | SPEC §19; MATRIX §F; BACKLOG `PERF-001`, `PERF-002` | Benchmark gate and correctness reruns meet approved budgets on the reference environment. | `PERF-001`, `PERF-002`, `QA-003`, `QA-004` |
| `REQ-DOC-001` | `explicit` | `P1` | README, executable examples, merge semantics, env modes, validation, secret boundaries, diff, API reference, ADR index, and contributor guidance MUST match the shipped public API. Quick start MUST be runnable in under five minutes. | SPEC §32, §35; MATRIX §H; BACKLOG `DOC-001`–`DOC-003` | Docs/API drift checks, link checks, doctests, and packed examples pass. | `DOC-001`, `DOC-002`, `DOC-003`, `QA-002` |
| `REQ-SEC-006` | `explicit` | `P1` | `SECURITY.md` MUST define supported versions, private disclosure, response/advisory flow, and exact guarantee boundaries. The npm tarball MUST be allowlisted and contain no credentials, private fixtures, or unintended artifacts. | MATRIX §G–H; BACKLOG `SEC-005`, `REL-002` | Policy checker/tabletop and exact-tarball allowlist/secret scan pass. | `SEC-005` (`P0`), `REL-002` (`P0`), `QA-004` (`P0`) |
| `REQ-REL-001` | `explicit` | `P1` | SemVer, changelog, migration and maintenance/support policies, alpha, beta, RC, seven-day soak or documented equivalent, final security audit, and zero open P0/P1 defects MUST gate stable release. Any code change after an RC requires a new RC. | MATRIX §G–H; BACKLOG `REL-001`, `REL-003`–`REL-006`, `MAINT-001` | Release workflow records every signed gate and rejects an incomplete promotion. | `REL-001`, `REL-003`, `REL-004`, `REL-005`, `REL-006`, `MAINT-001` |
| `REQ-REL-002` | `explicit` | `P1` | The stable tarball MUST be the audited candidate except version metadata, use trusted publishing/provenance, pass packed consumers before publish, and pass post-publish smoke tests. | ARCH §B; MATRIX §G–H; BACKLOG `REL-002`, `REL-005`, `REL-006` | Artifact hashes/content comparison, npm provenance verification, packed tests, and smoke test pass. | `REL-002`, `REL-005`, `REL-006`, `CI-001` |

## Optional and post-1.0 requirements

These rows are traceable but MUST NOT be used as core `1.0` release blockers.

| ID | Class | Priority | Normative requirement | Source | Verification | Owner tasks |
| --- | --- | --- | --- | --- | --- | --- |
| `REQ-OPT-001` | `optional recommendation` | `P2` | Lifecycle events MAY expose safe typed timing/count metadata; they MUST NOT expose values or change pipeline results when callbacks fail. OpenTelemetry and global publication remain excluded. | SPEC §20; BACKLOG `OBS-001` | If shipped, event unit/security suites pass; absence does not fail the `1.0` core gate. | `OBS-001` |
| `REQ-OPT-002` | `optional recommendation` | `P2` | Measured hotspot optimizations MAY ship when backed by benchmarks and unchanged correctness/security results. | BACKLOG `PERF-002` | If performed, before/after benchmark and all correctness suites pass. | `PERF-002` |
| `REQ-POST-001` | `post-1.0` | `P3` | Watch/reload orchestration MUST be a snapshot-based companion package, not mutable core behavior. | SPEC §14, §37; MATRIX §I | Core export absence test passes; future companion conformance tests new-snapshot behavior. | `POST-002` |
| `REQ-POST-002` | `post-1.0` | `P3` | CLI diagnostics MUST be a separate safe package/binary and MUST NOT add a raw-secret flag. | SPEC §21, §37; MATRIX §I | Core export/tarball absence test passes; future CLI E2E/security suite owns behavior. | `POST-003` |
| `REQ-POST-003` | `post-1.0` | `P3` | YAML/TOML and cloud/Kubernetes secret providers MUST be companion integrations using the public source contract. | SPEC §9.2, §28, §37; MATRIX §I | Core dependency/export absence test passes; future compatibility kit owns integrations. | `POST-001` |
| `REQ-POST-004` | `post-1.0` | `P3` | Typed path helpers, OpenTelemetry, `diagnostics_channel`, codecs, advanced merge extensions, and remote orchestration require an RFC, benchmarks, and security analysis outside stable root exports. | SPEC §16.3, §20, §37; MATRIX §I | Core API absence test passes; each future RFC defines its own suite before implementation. | `POST-004` |

## Baseline acceptance rule

A mandatory row is release-eligible only when its owner task is complete, every
linked suite in `traceability.md` is green, and its stated observable result is
met. `P2` and `P3` rows cannot satisfy or replace a missing `P0`/`P1` row.
