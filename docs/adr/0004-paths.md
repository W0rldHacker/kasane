# ADR-0004: Canonical path grammar and provenance lookup

- Status: Accepted
- Date: 2026-07-15
- Decision owners: `ARCH-002`
- Requirements: `REQ-DATA-001`, `REQ-PATH-001`, `REQ-PATH-002`,
  `REQ-MERGE-003`, `REQ-PROV-002`, `REQ-PROV-003`
- Resolves: `DEC-005`, `DEC-010`, `DEC-011`

## Context

The same path is consumed by snapshot reads, merge-rule lookup, secret path
policy, provenance, validation issues, explanations, and diff. Different
parsers or container-origin interpretations would make a value readable under
one spelling but unexplainable or unprotected under another.

This ADR fixes one string grammar and the public meaning of leaf, container,
missing, and removed paths. It does not implement a parser, cache, trie, or
provenance storage.

## Decision

All path-consuming core modules use one canonical parser and segment model.
Public paths use dot notation with exactly two escapes:

```abnf
path          = root / non-empty-path
root          = ""
non-empty-path = segment *("." segment)
segment       = 1*(plain / escaped-dot / escaped-backslash)
escaped-dot   = "\."
escaped-backslash = "\\"
plain         = any character except "." and "\"
```

The ABNF is descriptive about JavaScript string characters rather than wire
bytes. Its normative consequences are:

- `''` is the root and is the only empty path;
- an unescaped dot separates segments;
- `\.` represents a literal dot inside one segment;
- `\\` represents one literal backslash inside one segment;
- a leading, trailing, or repeated separator creates an empty segment and is
  invalid;
- a dangling backslash or any other escape such as `\q` is invalid;
- parsing never consults object prototypes or inherited properties.

Canonical serialization escapes every backslash as `\\`, then every literal
dot as `\.` and joins segments with `.`. Parsing and serialization must
round-trip the same segment sequence.

### Formal examples

| Input path | Parsed segments | Meaning |
| --- | --- | --- |
| `''` | `[]` | Root value, including scalar, array, object, or `null` |
| `a.b.c` | `['a', 'b', 'c']` | Three object/container steps |
| `a\.b.c` | `['a.b', 'c']` | Key `a.b`, then key `c` |
| `a\\b.c` | `['a\b', 'c']` | Key containing a backslash, then key `c` |
| `items.0` | `['items', '0']` | Index `0` when `items` resolves to an array |
| `matrix.1.2` | `['matrix', '1', '2']` | Nested array indices where both parents are arrays |
| `object.0` | `['object', '0']` | Property key `0` when the parent is an object |

The following strings fail parsing: `.a`, `a.`, `a..b`, `a\`, and `a\q`.
Segments `-1`, `+1`, and `01` are valid object keys, but fail array-index
resolution when their parent is an array. The syntactically valid path
`items.1.0` resolves as missing when `items.1` is absent or is not a container.

### Array indices

A segment is interpreted as an array index only when its resolved parent is an
array. The canonical decimal syntax is:

```abnf
array-index = "0" / non-zero-digit *digit
digit = %x30-39
non-zero-digit = %x31-39
```

Therefore an index has no sign, whitespace, fraction, exponent, or leading
zeroes. `0`, `7`, and `123` are valid; `-1`, `+1`, `01`, `1.0`, and `1e2` are
not array indices. A syntactically valid index outside the current array length
resolves as missing. Implementations must reject or bound an index that cannot
be safely represented; they must not wrap or truncate it.

Numeric-looking segments under objects remain ordinary string keys. This keeps
`object.0` usable without inventing a separate bracket grammar.

### Root and containers

The root path `''` participates in every path API and may resolve to any
`ConfigNode`. Root removal creates an absent root plus a root tombstone; a later
root set supersedes that tombstone as current state. Root absence is a pipeline
state, not a `ConfigNode` value and not `null`. Validation may establish a new
root with synthetic validation origin. Snapshot construction requires a present
`ConfigNode`; if the final post-validation root is still absent, orchestration
fails safely and returns no snapshot. It must not coerce absence to an empty
object or `null`.

For a leaf, `origin(path)` is the origin of the current value. For a structural
container, `origin(path)` is the origin record of the last structural operation
that directly touched that container: set, replace, merge, append, or prepend.
It is not an assertion that every descendant came from that source.

`explain(container)` must expose the structural operation and mark the result as
mixed when current descendants have different origins. In particular:

- recursive object merge may update the container structural origin while
  untouched children retain older origins;
- array replace gives the container and new elements the replacing origins;
- append/prepend gives the container the operation origin while retained array
  elements preserve their origins and indices are remapped;
- an empty container can have a structural origin even without leaf children.

When provenance mode is `none`, origin is unavailable rather than inferred from
the value.

### Found, missing, and removed

These states are distinct:

| State | Materialized value | `get` | `has` | `origin` | `explain` |
| --- | --- | --- | --- | --- | --- |
| Found | Present | Current value | `true` | Current leaf/container origin when enabled | `{ found: true, ... }` |
| Missing, never observed | Absent | `undefined` | `false` | `undefined` | `{ found: false, nearest }` |
| Removed | Absent | `undefined` | `false` | `undefined` | `{ found: false, nearest, removal }` |

Canonical values never contain `undefined`, so `has` unambiguously distinguishes
a missing path from a present value returned by `get`.

### Tombstones

Every explicit removal creates a provenance tombstone at its canonical path,
including removal of a missing path and the root. A tombstone:

- has no current materialized value or current origin;
- records the removing layer/validation origin, operation `remove`, safe source
  metadata, and secret state needed for safe diagnostics;
- may preserve ordered prior history only in `full` mode;
- is available to `explain` and diff logic but never appears in `snapshot.value`
  or `toJSON()`;
- can explain a missing descendant through the nearest removed ancestor without
  requiring a materialized tombstone for every former child.

A later set/replace/merge at the same effective path supersedes the current
tombstone. Full history may retain the removal event; `origin-only` retains only
the new current origin. A repeated removal remains a materialized-value no-op
but updates diagnostics deterministically according to the actual layer order.

## Shared consumers

The parser and canonical serializer are shared by:

- `get`, `has`, `require`, `origin`, and `explain`;
- exact merge-rule paths;
- secret path policy;
- validation issue normalization and reconciliation;
- provenance/tombstone lookup;
- diff output and deterministic sorting.

No consumer may repair, reinterpret, case-fold, or accept a grammar rejected by
the shared parser.

## Consequences

### Positive

- One path has the same meaning across merge, provenance, validation, secrets,
  snapshot, and diff.
- Root scalars and arrays need no special API.
- Container explanations do not pretend that a mixed subtree has one source.
- Missing and explicitly removed values remain distinguishable without a value
  sentinel.

### Costs

- Literal dots and backslashes require escaping.
- Empty path segments and non-canonical array spellings are unavailable.
- Container origin needs a structural record in addition to child origins.
- Changing this grammar after `1.0` is a breaking public API change.

## Rejected alternatives

- Separate path parsers per feature: creates security and lookup disagreement.
- JSON Pointer or bracket syntax in core: expands the `1.0` grammar without a
  demonstrated requirement.
- Treating every numeric segment as an index: makes numeric object keys
  inaccessible.
- Deriving container origin from a random/first/last child: hides mixed origin
  and changes when traversal order changes.
- Materializing `remove` as a value sentinel: leaks an operation into ordinary
  configuration data.

## Verification

Future `TS-SNAPSHOT`, `TS-MERGE`, `TS-PROVENANCE`, and `TS-ARCH` fixtures must
share one path corpus and prove:

1. `a\.b.c` resolves segments `a.b` and `c` everywhere;
2. `items.0` resolves array index zero and `object.0` resolves an object key;
3. `''` resolves every supported root kind;
4. malformed escapes, empty segments, signs, and non-canonical indices fail;
5. leaf and mixed-container origin behavior is stable;
6. missing and removed paths differ only through safe tombstone diagnostics;
7. root, existing, absent, and repeated removal never materialize `remove`;
8. no path lookup reaches inherited or dangerous prototype properties.

## Related documents

- [ADR-0001: Core pipeline](./0001-core-pipeline.md)
- [ADR-0005: Validation provenance](./0005-validation-provenance.md)
- [ADR-0006: Safe serialization](./0006-safe-serialization.md)
- [Architecture](../architecture.md)
- [Decision register](../assumptions.md)
