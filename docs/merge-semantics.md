# Merge semantics

Status: normative for core `1.0` (`MERGE-001`).

This document fixes merge decisions before the merge/provenance engine is
implemented. It covers `REQ-MERGE-001` through `REQ-MERGE-003` and uses the
canonical value and path contracts from `MODEL-001` and ADR-0004.

## Value states

A materialized value has exactly one `ConfigNode` kind:

- `null`;
- `boolean`;
- finite `number`;
- `string`;
- dense `array`;
- plain `object`.

`absent`, `undefined`, and `remove` are control states, not `ConfigNode` kinds:

- `absent` means that the effective path currently has no value;
- root `undefined` or an omitted object property is a no-op;
- `remove` is a unique marker operation and is never a string merge strategy or
  a materialized value.

## Default decision table

The table is exhaustive over every old state and incoming normalized kind. It
is generated from the same fixture as the merge decision tests.

<!-- merge-matrix:start -->
| Existing \ incoming | `undefined` | `remove` | `null` | `boolean` | `number` | `string` | `array` | `object` |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `absent` | `no-op` | `remove` | `set` | `set` | `set` | `set` | `set` | `set` |
| `null` | `no-op` | `remove` | `replace` | `replace` | `replace` | `replace` | `replace` | `replace` |
| `boolean` | `no-op` | `remove` | `replace` | `replace` | `replace` | `replace` | `replace` | `replace` |
| `number` | `no-op` | `remove` | `replace` | `replace` | `replace` | `replace` | `replace` | `replace` |
| `string` | `no-op` | `remove` | `replace` | `replace` | `replace` | `replace` | `replace` | `replace` |
| `array` | `no-op` | `remove` | `replace` | `replace` | `replace` | `replace` | `replace` | `replace` |
| `object` | `no-op` | `remove` | `replace` | `replace` | `replace` | `replace` | `replace` | `merge` |
<!-- merge-matrix:end -->

Consequences:

- default object/object is the only recursive combination;
- arrays are atomic and default to replacement, including array/array;
- `null` is an explicit value and replaces every present old kind;
- a defined incoming value initializes an absent path;
- removing an absent path changes no materialized value but preserves removal
  intent in provenance;
- `undefined` neither changes a value nor creates provenance/history.

## Decision precedence

For one canonical path, decisions occur in this order:

1. Incoming `undefined` resolves to no-op. No rule lookup occurs.
2. Incoming `remove` resolves to remove intent. No rule lookup occurs.
3. A defined incoming value at an absent path resolves to set. No combining
   strategy is needed for initialization.
4. For a present old value and a defined incoming value, look up one rule at
   the exact canonical path.
5. Apply that rule, or use the default table when no exact rule exists.

This ordering means an `append` path may be initialized by its first array. A
later value at that path must satisfy array/array before append is selected.

## Explicit strategies

The complete `1.0` strategy set is `replace`, `merge`, `append`, and `prepend`.

| Strategy | Present old value | Defined incoming value | Decision |
| --- | --- | --- | --- |
| `replace` | any `ConfigNode` | any `ConfigNode` | replace subtree |
| `merge` | object | object | recursive merge |
| `merge` | any other pair | any other pair | `merge-requires-object-pair` error |
| `append` | array | array | old elements, then incoming elements |
| `append` | any other pair | any other pair | `append-requires-array-pair` error |
| `prepend` | array | array | incoming elements, then old elements |
| `prepend` | any other pair | any other pair | `prepend-requires-array-pair` error |

Append and prepend preserve order and do not deduplicate. Their value and
provenance implementation belongs to `MERGE-003`; this task specifies only the
decision and mismatch result.

`remove` is deliberately absent from `MergeStrategy`. A string value
`"remove"` is an ordinary configuration string. The future unique marker is
allowed only at root or object value positions and is rejected inside arrays.

## Rule index

Rules are normalized and indexed once during startup. The index contract is:

- paths use the ADR-0004 grammar, including `''` for root, `\.` for a literal
  dot, and `\\` for a literal backslash;
- lookup is one exact `Map` lookup using the current canonical path;
- a rule at `database` does not apply to `database.host`;
- a rule at `a\.b.items` matches the segments `a.b`, then `items`; it does not
  match `a.b.items`;
- `*` and `**` have no wildcard meaning; they are ordinary literal segments;
- duplicate paths after parse/canonical serialization fail startup with
  `duplicate-merge-rule`;
- malformed paths and values outside the four strategy strings fail startup;
- callbacks, parent-prefix fallback, pattern matching, and rule precedence are
  absent from core `1.0`.

When a parent decision is replace, merge does not descend and child rules are
not consulted. When a parent decision is recursive merge, each visited child
performs its own exact lookup.

## Removal and absence

Remove is an operation rather than a value combination:

| Old state | Incoming marker | Materialized result | Diagnostic intent |
| --- | --- | --- | --- |
| present | `remove` | path becomes absent | removal/tombstone |
| absent | `remove` | remains absent | removal/tombstone |
| root present | `remove` | root becomes absent | root removal/tombstone |

Repeated removal is deterministic. A final absent root cannot produce a
snapshot, as fixed by ADR-0004. Tombstone storage and array-marker rejection are
implemented by `MERGE-003`, not by this specification task.

## Implementation boundary

`strategy.ts` classifies cells and type mismatches. `rule-index.ts` validates
declarations and exposes immutable exact lookup. Neither module merges values,
mutates inputs, creates provenance, implements removal, or accepts user
callbacks.

## Verification

The `merge-semantics` unit fixture must prove:

1. all 56 default old/incoming cells have one decision;
2. object/object recursively merges and array/array replaces by default;
3. null replaces, undefined is no-op, and remove remains explicit;
4. every explicit strategy valid pair and mismatch has one outcome;
5. escaped paths match exactly, without parent or wildcard fallback;
6. duplicate normalized paths fail before merge starts;
7. the runtime strategy set contains only four strings and no callback.

## Related documents

- [Requirements](./requirements.md)
- [Traceability](./traceability.md)
- [ADR-0001: Core pipeline](./adr/0001-core-pipeline.md)
- [ADR-0004: Canonical paths](./adr/0004-paths.md)
