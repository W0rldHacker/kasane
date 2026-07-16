# ADR-0002: Sequential layer ordering

- Status: Accepted
- Date: 2026-07-15
- Decision owners: `ARCH-001`, future implementation `SRC-001`
- Requirements: `REQ-CORE-001`, `REQ-MERGE-001`, `REQ-PROV-002`
- Resolves: `DEC-001`, part of `DEC-014`

## Context

Layer order is both the precedence mechanism and part of provenance. Sources
may be asynchronous and may perform trusted side effects. Parallel loading with
ordered merge would appear equivalent for pure values, but changes start time,
failure selection, abort behavior, lifecycle events, and what external state a
source observes.

The product promises an explainable sequence, so scheduling must be as explicit
as merge order.

## Decision

Layers are processed strictly sequentially in their declared array order. For
each enabled descriptor, the complete `load → normalize → merge/provenance`
step finishes before loading the next enabled descriptor begins.

Later enabled layers have higher priority. There is no numeric priority,
source-kind priority, implicit environment priority, or registration-time
priority.

### Preflight

Before any source I/O or custom `load()` call, orchestration validates all layer
descriptors:

- name is a non-empty trimmed string;
- names are unique across the declaration set;
- descriptor and source shape are valid;
- options required to decide whether a layer is enabled are valid.

A duplicate or invalid name fails the invocation without loading any source.
Disabled layers do not load or merge and do not create an origin. Their declared
position remains observable only to declaration validation and optional safe
lifecycle metadata.

### Scheduling

For enabled layers `L0 … Ln`, orchestration behaves as if it executes:

```text
await load(L0) → normalize(L0) → merge(L0)
await load(L1) → normalize(L1) → merge(L1)
…
await load(Ln) → normalize(Ln) → merge(Ln)
```

It MUST NOT prefetch a later source, use `Promise.all`, or start the next load
while normalization/merge of the current layer is in progress.

### Failure and abort

- A source, normalization, or merge failure stops processing immediately.
- No later source starts after a failure.
- Abort is checked at orchestration boundaries and passed to sources through
  `SourceContext` where supported.
- A failure or abort returns no partial snapshot.
- Exact public error selection is owned by `ERR-001`; it cannot depend on a
  race between parallel sources.

### Provenance and events

History order is the processed enabled-layer order. Numeric layer identifiers,
if used internally, cannot create a second priority system.

Lifecycle events, if implemented, follow the same sequential order. Event
delivery is observational: a callback exception is isolated and does not skip,
retry, reorder, or alter a layer or final result.

## Consequences

### Positive

- Precedence, history, events, side effects, and failures share one order.
- The same declaration produces reproducible scheduling across platforms.
- Custom sources do not need concurrency-safety guarantees imposed by core.
- Duplicate names are detected before I/O.

### Costs

- Independent slow sources cannot load in parallel.
- Total load time is the sum of source latencies plus processing time.

This cost is accepted for `1.0`. Parallel or prefetched loading requires an
explicit post-`1.0` opt-in ADR proving unchanged provenance, errors, abort, and
lifecycle semantics.

## Rejected alternatives

- Parallel load and ordered merge: external observations and failure races are
  still nondeterministic.
- Numeric priority: duplicates array order and permits contradictory ordering.
- Priority by source kind: silently encodes deployment assumptions.
- Registration-order plugin registry: introduces global state and hidden order.

## Verification

Architecture and integration tests must prove:

1. `load(L1)` is not called until merge of `L0` completes;
2. permutation of the declaration array produces the corresponding explicit
   precedence change;
3. duplicate names fail before the first load;
4. a disabled layer never loads and creates no origin;
5. a rejection or abort prevents later loads and snapshot creation;
6. lifecycle callback failure does not change order or result.

## Related documents

- [ADR-0001: Core pipeline](./0001-core-pipeline.md)
- [ADR-0003: Extension boundary](./0003-extension-boundary.md)
- [Architecture diagram](../architecture.md)
- [Decision register](../assumptions.md)
