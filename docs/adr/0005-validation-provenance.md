# ADR-0005: Validation transforms and provenance reconciliation

- Status: Accepted
- Date: 2026-07-15
- Decision owners: `ARCH-002`
- Requirements: `REQ-VAL-001`, `REQ-VAL-002`, `REQ-VAL-003`,
  `REQ-PROV-002`, `REQ-SEC-002`, `REQ-DIFF-002`
- Resolves: `DEC-007`, validation consequences of `DEC-009`

## Context

A function or Standard Schema validator may return a new value rather than only
accept or reject input. Coercion can change a scalar, defaults can add paths,
normalization can expose unsupported output, and transforms can remove or
rewrite subtrees. Copying old provenance blindly attributes schema-created data
to an input source; assigning every result to validation erases the useful
source of coerced values.

This ADR defines path-based reconciliation after successful validation. It does
not implement a validator adapter, tree comparison algorithm, or issue
formatter.

## Decision

Validation is a trust and normalization boundary inside the pipeline:

```text
merged value/provenance
  → detached mutable validation input
  → validator output
  → full normalization and limits
  → path-based provenance reconciliation
  → secret-policy reapplication
  → snapshot
```

The validator never mutates the owned merge result. Its output is unknown data
and must pass the same supported-type, dangerous-key, cycle, depth, node, and
string checks as source output. A validation failure or invalid output produces
no snapshot.

### Synthetic validation source

Each validation run has one stable synthetic source identity:

```text
name: validation
kind: validation
reference: absent
```

The registry representation is implementation-specific, but public diagnostics
must not pretend that a schema-created path came from a file, env variable, or
secret provider.

### Reconciliation rules

Input and normalized output are compared by the canonical segment paths from
ADR-0004. Lineage is path-based, not object-identity or array-element-identity
tracking.

| Input state | Output state | Current provenance decision |
| --- | --- | --- |
| Existing, semantically equal | Existing, equal | Preserve current origin, operation, secret state, and history; do not add `transformed: true` |
| Existing leaf/scalar | Existing at the same path with changed normalized value or type | Preserve its current source identity and mark current provenance `transformed: true` |
| Existing container | Same container path with any structural/descendant change | Preserve its last structural source, mark `transformed: true`, and reconcile descendants independently |
| Existing path | Different container/leaf kind at the same path | Preserve the exact path's source with `transformed: true`; old descendants become validation removals and new descendants are validation additions |
| Absent | Added | Assign synthetic `validation` origin to the entire added subtree |
| Existing | Absent | Remove from materialized output and create a synthetic validation tombstone |
| Absent | Absent | Create no value, origin, history, or tombstone |

`transformed: true` says that validation changed the normalized value or
structure at an already existing canonical path. It does not replace that
path's source and is not set merely because a validator ran.

Schema-added paths use the synthetic source with a set/default semantic and no
invented input reference. Validation-removed paths use a synthetic remove
origin and retain prior safe history only when the provenance mode permits it.

### Containers and arrays

Container reconciliation follows the same structural-origin meaning as
ADR-0004. A changed existing container retains its previous structural source,
gets `transformed: true`, and can be marked mixed when descendants have
different origins.

Array reconciliation is index-path based for `1.0`. The validator does not
provide element identity, so the value now at `items.0` is treated as the
transformed successor of the previous `items.0` when both paths exist. Added
indices receive validation origin and removed indices receive validation
tombstones. Kasane does not infer moves or stable element identity.

This rule is deterministic and explicit even for sorting/filtering transforms;
applications that need semantic array identity must validate into an
object-keyed model or wait for a separately specified post-`1.0` facility.

### Full history

In `full` mode, reconciliation records that validation transformed, added, or
removed the affected path in pipeline order. For an existing transformed path,
the public current origin remains the input source plus `transformed: true`;
history may identify the validation action without relabelling the value as
schema-created. `origin-only` stores no prior value. `none` stores no hidden
provenance and cannot invent source attribution.

History never copies secret plaintext into metadata.

### Secret propagation

The validator may receive raw secret values in its detached input because it is
trusted executable code. Library guarantees resume at its returned-data
boundary.

After reconciliation, the central secret policy is reapplied:

- a coerced existing secret path retains its secret state and original source;
- a schema-added descendant under a secret-marked subtree is secret;
- a schema-added path matching explicit secret path policy is secret;
- another schema-added path is public by default;
- a removed secret path creates a secret tombstone and keeps prior history
  redacted/fingerprinted;
- a path policy can force secrecy even when a validator returns a public value.

Thus a schema-coerced secret can be used for validation and typed output but is
still redacted by `explain`, diff, errors, inspect, and `toJSON()`.

### Validation issues

On validator failure, issues resolve against the pre-validation merged
provenance because no successful output exists. Issue paths use ADR-0004 and are
sorted canonically. Unsupported or unsafe third-party issue segments degrade to
the root plus a safe segment description rather than invoking arbitrary
conversion.

Received and previous values are diagnostic surfaces and pass through central
redaction. Arbitrary validator error messages and causes follow ADR-0006.

### Diff implications

Diff compares validated normalized values and reconciled current origins. A
coercion at an existing path does not turn its source into `validation`, so
source-aware diff remains meaningful. A schema-added default has stable
validation source identity across snapshots. Validation tombstones participate
as removals, not as materialized values.

## Consequences

### Positive

- Coerced values remain attributable to the source that supplied them.
- Schema defaults are not falsely attributed to a file or environment variable.
- Removed fields are explainable after validation.
- Secret policy remains correct after schemas add or transform values.
- Diff observes the final typed value without losing source identity.

### Costs

- Successful transforms require a normalized tree comparison and reconciliation
  pass.
- Array provenance is path-based and does not infer moves.
- Full history must represent validation actions without storing unsafe values.

## Rejected alternatives

- Assign all output to `validation`: destroys source-aware diagnostics.
- Copy all old provenance by matching path without checking output: falsely
  attributes added/replaced descendants.
- Trust validator output without normalization: bypasses the data-plane security
  boundary.
- Skip secret policy after validation: allows schema defaults/coercions to escape
  path policy and redaction.
- Let validators mutate the merge result: breaks snapshot isolation and failure
  atomicity.

## Verification

Future `TS-VALIDATION`, `TS-PROVENANCE`, `TS-REDACTION`, and `TS-DIFF` fixtures
must prove:

1. an identity validator preserves provenance without a transform marker;
2. string-to-number coercion keeps the original source and sets
   `transformed: true`;
3. a schema-added default has synthetic source `validation`;
4. a removed field is absent and has a validation tombstone;
5. type/container rewrites do not copy old descendant origins to new paths;
6. array changes follow exact index paths and never infer moves;
7. unsafe validator output is rejected by full normalization and limits;
8. a schema-coerced secret remains secret on every diagnostic surface;
9. validation failure resolves issues against pre-validation provenance and
   returns no snapshot.

## Related documents

- [ADR-0001: Core pipeline](./0001-core-pipeline.md)
- [ADR-0004: Paths](./0004-paths.md)
- [ADR-0006: Safe serialization](./0006-safe-serialization.md)
- [Architecture](../architecture.md)
- [Decision register](../assumptions.md)
