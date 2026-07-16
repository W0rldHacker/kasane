# ADR-0001: Core pipeline and module boundaries

- Status: Accepted
- Date: 2026-07-15
- Decision owners: `ARCH-001`
- Requirements: `REQ-CORE-001`, `REQ-MERGE-004`, `REQ-SNAP-001`,
  `REQ-SNAP-002`, `REQ-SEC-003`, `REQ-VAL-002`

## Context

`kasane` must build provenance while merging, apply one secret policy to every
diagnostic surface, allow validation transforms, and publish only a completed
immutable snapshot. If sources, merge, validation, and snapshot creation are
allowed to call one another freely, provenance can be reconstructed after the
fact, redaction can be duplicated, and I/O can enter deterministic code.

This ADR fixes the control flow and dependency direction before runtime code
exists. It deliberately does not select merge algorithms, provenance storage,
concrete classes, or allocation strategies.

## Decision

One invocation of `kasane()` owns one orchestration context and executes this
logical pipeline:

```text
validate layer declarations
  → for each enabled layer in declaration order:
      load
      → normalize
      → merge and provenance update atomically
  → apply secret policy
  → validate a detached value
      → normalize validator output
      → reconcile provenance
      → reapply secret policy
  → create immutable snapshot
```

The short normative name of the pipeline remains:

```text
load → normalize → merge/provenance → secret policy → validate → snapshot
```

Re-normalization, provenance reconciliation, and secret-policy reapplication
are part of the validation stage. They do not create an alternative pipeline.

### Pipeline invariants

1. All layer descriptors and names are checked before the first source load.
2. Loading is sequential; ADR-0002 defines order and observation semantics.
3. Every source result crosses the normalization boundary before merge.
4. Merge returns value and provenance as one atomic result. Provenance is not
   reconstructed from the final value.
5. Secret policy operates on value/provenance metadata before any diagnostic
   representation can be materialized.
6. Validation receives a detached value. Validator output is untrusted data and
   crosses normalization again.
7. Validation reconciliation preserves the transform attribution defined by
   `DEC-007`, then reapplies path-based secret policy.
8. Snapshot construction is the only successful terminal state. A failure or
   abort at any earlier stage returns no partial snapshot.
9. Inputs, loaded values, and previously created snapshots are never mutated.

## Module dependency direction

The public entry point delegates to orchestration. Orchestration may depend on
ports and leaf modules; leaf modules must not call orchestration.

| Module or zone | Responsibility | May depend on | Must not depend on |
| --- | --- | --- | --- |
| Public entry points | Validate public call shape and delegate | Public types, orchestration | Internal storage, source adapters directly |
| Orchestration | Own invocation state and pipeline order | Layers, source port/adapters, normalize, merge, provenance, secret policy, validation adapter, snapshot, lifecycle boundary | Global mutable registry or singleton state |
| Layers | Immutable declarations and preflight checks | Public source/types contracts | I/O, merge, validation, snapshot |
| Source port | Minimal provider-neutral load contract | Public types, safe source context | Previous config, merge, provenance writer, validator, snapshot |
| Source adapters | Obtain data and safe source metadata | Source port; Node I/O only where required | Merge rules, validation, snapshot internals |
| Normalize | Convert unknown data to canonical `ConfigNode` | Pure value/error contracts | Node I/O, sources, orchestration, snapshot |
| Merge | Deterministically combine normalized nodes | Pure path/rule contracts and provenance write contract | Node I/O, sources, validators, snapshot, redaction formatting |
| Provenance | Record/read origin, operation, sensitivity, and history | Pure value/path contracts | Node I/O, sources, orchestration, snapshot UI |
| Secret policy | Compute sensitivity annotations | Pure paths and provenance contracts | Node I/O, source adapters, formatters |
| Redaction | Produce detached diagnostic-safe data | Pure value/provenance read contracts | Node I/O, sources, orchestration |
| Validation adapter | Invoke validator and normalize issues | Validator/public issue contracts | Sources, merge implementation, snapshot |
| Snapshot | Expose immutable reads, explanations, and diff | Paths, provenance readers, redaction, pure diff | Source adapters, Node I/O, orchestration mutation |
| Lifecycle boundary | Deliver observation-only events | Detached safe event types | Config values, pipeline mutation, global publication |

The allowed graph is acyclic at module level. A lower zone never imports a
higher coordinator merely to reuse behavior. Shared contracts move to a small
lower-level module instead.

## Pure core boundary

The following zones are platform-independent pure code:

- `normalize`;
- `merge` and merge rule lookup;
- provenance construction and reading;
- path parsing/resolution;
- secret policy and redaction;
- value diff and snapshot read helpers.

They MUST NOT import `node:fs`, `node:path`, `node:process`, networking modules,
or source adapters. Platform I/O stays in adapters and orchestration edges.
Node cryptography required by secret fingerprinting is isolated from redaction
and does not authorize I/O in other pure modules.

## State ownership and singleton policy

There is no global mutable config, source registry, plugin registry, path cache,
or lifecycle bus. Each `kasane()` call owns its invocation state; each snapshot
owns bounded caches and immutable value/provenance references. Module-level
constants may contain immutable algorithms or defaults only.

The absence of a singleton is part of the product boundary, not merely a coding
preference. It keeps tests isolated and prevents one consumer from changing the
configuration or extensions of another.

## Lifecycle callback boundary

Lifecycle observation is optional for `1.0`. If present, orchestration emits
only detached, secret-safe metadata at defined boundaries. A callback cannot
replace a stage result, receive configuration values, or change ordering. Its
exception is isolated and MUST NOT alter the returned snapshot or the pipeline
error. There is no global event publication.

## Failure and diagnostics

Stage errors cross one safe error boundary. Redaction is centralized; modules
must not implement local masking. Arbitrary source/validator causes are reduced
to sanitized summaries before they become public. Diagnostic formatting cannot
feed a value back into merge, provenance, validation, or snapshot construction.

## Consequences

### Positive

- Normalize, merge/provenance, sources, validation, and snapshot can be built
  and tested independently.
- Deterministic modules can run without filesystem or process state.
- Provenance and value cannot diverge through separate post-processing.
- All diagnostic consumers share one redaction boundary.
- A failed invocation cannot leak a partially constructed snapshot.

### Costs

- Orchestration explicitly coordinates more small stages.
- Validator transforms require a second normalization and provenance
  reconciliation pass.
- Source adapters cannot optimize by observing the accumulated config.

## Rejected alternatives

- Reconstructing provenance after merge: loses overwritten operations and
  cannot represent exact remove/append/prepend history.
- Letting sources merge or validate: couples integrations to core semantics and
  makes provider extensions incompatible.
- Putting I/O helpers in merge/normalize: makes deterministic tests and reuse
  dependent on platform state.
- A global config or plugin registry: creates hidden mutable dependencies and
  contradicts immutable snapshots.
- Independent masking inside errors, diff, and explain: one missed branch leaks
  secrets.

## Verification

`pnpm architecture:check` must eventually enforce:

1. no import from `sources` or source adapters into `merge`;
2. no Node I/O built-in import in normalize, merge, provenance, paths,
   secret-policy, or redaction zones;
3. no upward import from leaf modules into orchestration;
4. no public export or consumer import from `src/internal`;
5. no redaction implementation outside the central redaction module;
6. no module-level mutable singleton or global lifecycle bus.

Pipeline integration tests additionally prove stage order, atomic failure, and
that a throwing lifecycle callback cannot change the result.

## Related documents

- [Architecture diagram](../architecture.md)
- [ADR-0002: Layer ordering](./0002-layer-order.md)
- [ADR-0003: Extension boundary](./0003-extension-boundary.md)
- [ADR-0004: Paths](./0004-paths.md)
- [ADR-0005: Validation provenance](./0005-validation-provenance.md)
- [ADR-0006: Safe serialization](./0006-safe-serialization.md)
- [Normative requirements](../requirements.md)
- [Accepted assumptions](../assumptions.md)
- [Scope and non-goals](../scope.md)
