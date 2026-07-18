# Architecture decision record index

Architecture decision records preserve why a cross-cutting contract exists.
They are normative for maintainers when their status is `Accepted`; this index
is checked against every numbered ADR by `pnpm docs:check`.

## Decision register

| ADR | Status | Decision |
| --- | --- | --- |
| [ADR-0001](./0001-core-pipeline.md) | Accepted | Core pipeline, module boundaries, ownership, and atomic failure |
| [ADR-0002](./0002-layer-order.md) | Accepted | Strictly sequential layer loading and visible array precedence |
| [ADR-0003](./0003-extension-boundary.md) | Accepted | Provider-neutral `LayerSource` boundary with no plugin registry |
| [ADR-0004](./0004-paths.md) | Accepted | One canonical path grammar, root behavior, origin, and tombstones |
| [ADR-0005](./0005-validation-provenance.md) | Accepted | Validation transforms reconcile rather than discard provenance |
| [ADR-0006](./0006-safe-serialization.md) | Accepted | Central redaction and sanitized public causes |
| [ADR-0007](./0007-measured-hotspot-optimization.md) | Accepted | Bounded, measured hotspot optimizations without semantic change |

There are currently no superseded decisions. Superseded ADRs remain in this
table and in the repository; they are never deleted or silently rewritten.

## Lifecycle

An ADR uses one of these states:

- `Proposed`: under review and not yet normative. Drafts live outside the
  numbered accepted register, normally under `docs/adr/proposals/`.
- `Accepted`: approved and enforced by implementation, tests, and documentation.
- `Superseded`: historical decision replaced by a newer accepted ADR. The old
  file adds `- Superseded by: ADR-NNNN`, and both index rows link to each other.
- `Rejected`: considered but not adopted. Rejected proposals may remain in the
  proposal area for context but do not consume the accepted sequence.

Numbered records are append-only. A number is allocated when a proposal is
accepted. Fixing links, spelling, or newly discovered factual evidence is
allowed, but changing the decision or consequences requires a new ADR that
supersedes the old one.

## When is an ADR required?

Open an ADR before implementation when a change affects more than one of these
areas or alters a stable boundary:

- public exports, semantics, defaults, compatibility, or extension contracts;
- module direction, ownership, global state, caching, or structural sharing;
- merge, provenance, paths, validation reconciliation, or snapshot identity;
- redaction, secrets, error/diagnostic output, resource budgets, or trust;
- runtime dependencies, provider integration, package layout, or release model;
- performance complexity that is not already justified by measured evidence.

Local refactoring that preserves accepted decisions, public output, security
boundaries, and performance budgets does not need a new ADR.

## ADR template

Create the next numbered Markdown file with:

```md
# ADR-NNNN: Decision title

- Status: Accepted
- Date: YYYY-MM-DD
- Decision owners: `TASK-NNN`
- Requirements: `REQ-AREA-NNN`

## Context

## Decision

## Consequences

### Positive

### Costs

## Rejected alternatives

## Verification

## Related documents
```

The verification section names concrete commands and regression suites. A
security- or performance-sensitive decision includes threat/budget evidence,
not only implementation preference.

## Review and supersession procedure

1. Link the proposal from the pull request and identify affected requirements.
2. Review public compatibility, semantics, security, performance, packaging,
   and rollback consequences.
3. Obtain owner approval before merging dependent implementation.
4. Add or update executable enforcement in the same change.
5. Update this index and every affected guide.
6. To supersede, accept the replacement first, mark the old record
   `Superseded`, add its forward link, and retain all historical text.

Related governance: [Architecture](../architecture.md),
[Scope](../scope.md), [Requirements](../requirements.md), and
[Contributing](../../CONTRIBUTING.md).
