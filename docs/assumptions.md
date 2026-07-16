# Accepted assumptions and product decisions

Baseline: [requirements](./requirements.md) · [scope](./scope.md) ·
**assumptions** · [traceability](./traceability.md)

## Purpose

This register resolves specification ambiguities before runtime implementation.
Every entry is accepted for the `1.0` baseline. An implementation MUST NOT pick
a different interpretation without an accepted ADR and synchronized changes to
all four baseline documents.

`Assumption` records a boundary that cannot yet be proven in code. `Decision`
selects one behavior from multiple plausible interpretations. All decisions in
this register are classified as `inferred implementation decision` in
`requirements.md`.

Source aliases are defined in the source registry in
[requirements.md](./requirements.md).

## Decision register

| ID | Type | Accepted decision | Source | Consequence | Owner and verification |
| --- | --- | --- | --- | --- | --- |
| `DEC-001` | Decision | Layers load strictly sequentially in declared array order. | BACKLOG `FOUND-001`, `ARCH-001`, `SRC-001`; ARCH §B; [ADR-0002](./adr/0002-layer-order.md) | Side effects, aborts, and lifecycle order are reproducible; no `Promise.all`. | `ARCH-001`, `SRC-001`; architecture and layer-order integration suites |
| `DEC-002` | Decision | Default provenance mode is `origin-only`; supported modes are `none`, `origin-only`, `full`. | BACKLOG `FOUND-001`, `PROV-002`; ARCH §B | Default preserves current origin without retaining full value history. | `PROV-002`; provenance-mode unit suite |
| `DEC-003` | Decision | Stable `1.0` is ESM-only; no CJS condition or dual build. | BACKLOG `FOUND-001`, `PKG-001`; ARCH §B | Avoids dual-package hazards; CJS demand requires a later ADR and full matrix. | `PKG-001`, `QA-005`, `REL-002`; packed-consumer suite |
| `DEC-004` | Assumption | Zero runtime dependencies is the release target. | BACKLOG `FOUND-001`; ARCH §B; SPEC §32 | Standard Schema is structural; external parsers/schemas remain consumer choices. An exception requires a supply-chain ADR. | `FOUND-002`, `PKG-001`, `REL-002`; manifest/lock/tarball audit |
| `DEC-005` | Decision | Root may be any `ConfigNode`; `''` is the canonical root path. A final absent root is not coerced and cannot produce a successful snapshot. | BACKLOG `FOUND-001`, `ARCH-002`, `MODEL-001`; ARCH §B; [ADR-0004](./adr/0004-paths.md) | All snapshot/path/validation operations work for scalar, array, object, and `null` roots; validation may establish an absent root before snapshot construction. | `MODEL-001`, `SNAP-001`; root-kind and path suites |
| `DEC-006` | Decision | `toJSON()` always returns a detached redacted representation. Raw access is only through `snapshot.value`. | ARCH §B; BACKLOG `ARCH-002`, `SNAP-001`, `SEC-002`; [ADR-0006](./adr/0006-safe-serialization.md) | `JSON.stringify(snapshot)` is safe by default; the earlier descriptive `toJSON(): T` example is not a raw-secret contract. | `ARCH-002`, `SNAP-001`, `SEC-002`; redaction/security suite |
| `DEC-007` | Decision | Validators receive a detached copy and their result is normalized again. Existing changed paths keep origin plus `transformed: true`; new paths get synthetic `validation` origin; removed paths get validation tombstones. | ARCH §B; BACKLOG `ARCH-002`, `VAL-001`; [ADR-0005](./adr/0005-validation-provenance.md) | Coercion/defaults are supported without falsely attributing schema-created data to a source layer. | `ARCH-002`, `VAL-001`, `VAL-002`; validation reconciliation suite |
| `DEC-008` | Decision | Env default casing is `lower`; users may explicitly request `preserve`. Default separator is `__`, default coercion is false, and keys are sorted before mapping. | BACKLOG `SRC-003`; SPEC §9.3 | Platform enumeration and casing differences do not silently choose a winner; collisions fail. | `SRC-003`, `QA-006`; env integration/cross-platform suite |
| `DEC-009` | Decision | Secret state is value/history-entry scoped. A public override clears value-level secret state, old history remains secret, and matching path policy forces the current value to stay secret. | ARCH §B; BACKLOG `SEC-001`; [ADR-0005](./adr/0005-validation-provenance.md) | A formerly secret path is not permanently tainted, but no previous secret becomes printable. | `SEC-001`, `SEC-002`; secret transition and canary suites |
| `DEC-010` | Decision | Removing an absent path is a materialized-value no-op that creates a diagnostics-only tombstone. Root removal is allowed; `remove` in arrays is rejected. | BACKLOG `ARCH-002`, `MERGE-003`; [ADR-0004](./adr/0004-paths.md) | `explain` can distinguish never-present from explicitly removed without inventing a value. | `MERGE-003`, `PROV-001`, `SNAP-002`; remove/tombstone suites |
| `DEC-011` | Decision | Paths use dot notation with `\.` and `\\` escaping, unsigned decimal array indices, and no empty intermediate segments. Merge rules use exact canonical paths only. | ARCH §B; BACKLOG `ARCH-002`, `MERGE-001`; [ADR-0004](./adr/0004-paths.md) | One grammar is shared by get/origin/explain/rules/secrets/validation/diff. | `ARCH-002`, `SNAP-001`, `MERGE-001`; shared path fixture |
| `DEC-012` | Decision | Public errors retain only sanitized cause summaries; arbitrary raw `Error` objects are not exposed through inspect or JSON. | ARCH §B; BACKLOG `ARCH-002`, `ERR-001`; [ADR-0006](./adr/0006-safe-serialization.md) | A custom parser/source error cannot become a secret-exfiltration side channel. | `ERR-001`, `SEC-004`; error and malicious-cause security suites |
| `DEC-013` | Assumption | Custom source/parser/validator/Proxy code is trusted executable code; every returned data value is untrusted. Kasane secures the data plane but does not sandbox JavaScript. | BACKLOG `ARCH-001`, `SRC-002`, `SEC-004`, `SEC-005`; [ADR-0003](./adr/0003-extension-boundary.md) | Outputs are normalized and bounded; execution behavior remains the application owner's responsibility. | `SEC-004`, `SEC-005`, `DOC-002`; threat-model/docs checks |
| `DEC-014` | Decision | `cwd` and env source are snapshotted once at load boundaries; source and diff identity use stable safe references, never process enumeration order or numeric IDs across snapshots. | BACKLOG `SRC-001`, `SRC-003`, `DIFF-001`; [ADR-0002](./adr/0002-layer-order.md), [ADR-0003](./adr/0003-extension-boundary.md) | The same declared input has reproducible resolution and cross-snapshot comparison. | `SRC-001`, `SRC-003`, `DIFF-001`; integration and diff suites |

## General assumptions

| ID | Assumption | Risk if false | Validation point |
| --- | --- | --- | --- |
| `ASM-001` | The primary workload is 1–10 layers, 100–10,000 leaves, depth 10–20, and infrequent `explain` calls. | Provenance, freeze, or caches may exceed practical budgets. | `PERF-001` benchmarks before beta; production measurements may trigger an ADR. |
| `ASM-002` | Node.js 22 and 24 are the supported release lines for `1.0`; runtime floor is `>=22`. | Consumer compatibility or toolchain support may be inadequate. | `QA-006` required matrix and `REL-002` packed consumers. |
| `ASM-003` | Structural Standard Schema support is sufficient without coupling core to a specific schema library. | A required validation feature might need a dependency or richer contract. | `VAL-001` adapter fixtures and alpha consumer feedback. |
| `ASM-004` | Arrays can be treated atomically in diff and replaced by default without blocking primary use cases. | Users may need granular identity/diff semantics. | Alpha/beta feedback; any change is post-`1.0` RFC work. |
| `ASM-005` | `origin-only` provides acceptable default memory use while preserving product differentiation. | Metadata may still be too large for common services. | `PERF-001` memory budgets and alpha soak; semantics remain unchanged if optimized. |
| `ASM-006` | A redacted `toJSON()` is more valuable and safer than generic type fidelity for snapshot serialization. | Some consumers may expect `JSON.stringify(snapshot)` to equal raw `value`. | Executable examples and alpha feedback; raw access remains explicit. |
| `ASM-007` | Kasane is distributed under the MIT license. | Ownership or dependency-license constraints may require a different license before publication. | `FOUND-002` records the license; `REL-002` audits the packed artifact before release. |

## Resolved conflicts with descriptive material

- Descriptive interfaces that show `toJSON(): T` express shape convenience, not
  permission to expose secrets; `DEC-006` is normative.
- An env example showing numbers does not enable coercion by default;
  `coerce: false` is normative and schema conversion is recommended.
- Examples built around object roots do not constrain the root type;
  `DEC-005` permits every `ConfigNode`.
- A `secret` layer marks its values, not an eternal path state; `DEC-009`
  separates value annotations, history annotations, and explicit path policy.
- Removing a missing path is not an error and not a core value; `DEC-010`
  records only diagnostic intent.

## Open decisions

There are no unresolved product ambiguities required to begin the next
foundation tasks. Numeric defaults for resource and performance budgets remain
owned by `MODEL-002`, `SEC-004`, and `PERF-001`; those tasks may select values
within this baseline but cannot weaken the existence of a bound or gate.
