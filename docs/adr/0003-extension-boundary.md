# ADR-0003: Provider-neutral extension boundary

- Status: Accepted
- Date: 2026-07-15
- Decision owners: `ARCH-001`, future implementation `SRC-001`
- Requirements: `REQ-CORE-002`, `REQ-SRC-001`, `REQ-SRC-005`,
  `REQ-PKG-001`, `REQ-PKG-002`
- Resolves: `DEC-013`

## Context

Users need configuration from memory, files, environment variables, secret
systems, and application-specific services. Core cannot embed each provider or
format without expanding dependencies, security surface, release coupling, and
deployment assumptions.

An extension boundary must let built-in and companion sources supply data while
preventing them from changing merge, provenance, validation, snapshot, or
redaction semantics.

## Decision

`LayerSource` is the single provider-neutral loading port for built-in, custom,
and future companion sources. Its conceptual contract is intentionally small:

```ts
interface LayerSource {
  readonly kind: string;
  load(context: SourceContext): unknown | Promise<unknown>;
}

interface SourceContext {
  readonly cwd: string;
  readonly signal?: AbortSignal;
}
```

This is an architectural contract, not publication of final signatures; exact
public types remain owned by `SRC-001` and `TYPE-001`.

A layer descriptor owns the unique layer name, enablement, and source instance.
Orchestration owns priority, normalization, merge/provenance, secret policy,
validation, and snapshot creation.

### Source responsibilities

A source may:

- obtain a value from its declared provider;
- honor `cwd` and `AbortSignal` when applicable;
- return safe, bounded source metadata such as a resolved path or environment
  variable name;
- throw/reject with a cause that the orchestration error boundary sanitizes.

A source must not:

- read the accumulated or previous configuration;
- perform merge, apply merge rules, or choose precedence;
- construct or mutate provenance;
- validate the final configuration;
- apply redaction or format diagnostics;
- construct or mutate a snapshot;
- register itself globally or discover other sources;
- expose source contents or secret values as metadata.

### Trust boundary

Custom source, parser, validator, and Proxy behavior is trusted executable code
running in the application process. Kasane does not sandbox JavaScript.

Every value returned by a source is untrusted data. It MUST cross normalization,
dangerous-key/type checks, cycle checks, and resource limits before merge. Safe
metadata crosses its own sanitizing boundary and never bypasses redaction.

This distinction prevents a false security promise: core protects its data
plane, not execution of arbitrary application code.

### Built-in adapters

`value`, JSON `file`, `env`, and `secret` are core adapters over the same source
port. They receive no privileged merge or snapshot access. Node I/O required by
`file` or environment capture stays inside the adapter edge and does not enter
normalize, merge, paths, provenance, or redaction.

### Companion integrations

YAML/TOML parsers, Vault/cloud/Kubernetes providers, watch, CLI, and telemetry
remain outside core `1.0`. A companion source package implements only public
contracts and is independently versioned. Adding a provider MUST NOT require a
new branch in merge, provenance, validation, snapshot, or redaction.

There is no plugin registry, auto-discovery, deep import, or service locator.
Applications explicitly construct and place source descriptors in `layers`.

### Stable extension test

The extension boundary is sufficient only if an external package can implement
a custom async source, return an unknown value and safe reference, be aborted,
and participate in the ordinary pipeline using public exports alone. Core must
not know the source kind in advance.

## Consequences

### Positive

- Providers and formats evolve independently of core.
- Core keeps a narrow dependency and security surface.
- Every source receives identical normalization and provenance behavior.
- Explicit construction preserves visible ordering and avoids global state.

### Costs

- A source cannot implement context-dependent overrides based on accumulated
  config; applications must produce such data before the pipeline or as an
  explicit layer.
- Provider packages need their own retries, authentication, release policy, and
  conformance tests.
- Core cannot promise to sandbox defective or malicious extension code.

## Non-goals preserved by this boundary

- no DI container, framework, feature-flag platform, or global singleton;
- no secret-manager/provider SDK in core;
- no proprietary schema DSL;
- no built-in YAML/TOML or JavaScript config execution;
- no arbitrary merge callbacks or source-owned merge logic;
- no watch, remote polling, CLI, plugin registry, or automatic discovery;
- no OpenTelemetry/global lifecycle bus in core;
- no public `src/internal` or deep imports.

Changing any item requires the ADR and scope-change process defined in
`scope.md`.

## Rejected alternatives

- Provider-specific core interfaces: couple releases and leak provider concepts
  into merge/provenance.
- Passing previous config into `load`: makes a source a hidden computed layer
  and creates order-dependent business logic.
- Source-owned normalization/merge: permits incompatible security and semantic
  behavior between providers.
- Plugin registry/auto-discovery: adds hidden global state and ordering.
- Executing providers in a pretend sandbox: cannot be guaranteed inside the
  same JavaScript process.

## Verification

Architecture, type, and packed-consumer tests must prove:

1. `sources`/adapters cannot be imported by `merge`;
2. source contracts do not expose previous config, merge rules, provenance
   writers, validator state, redactor, or snapshot internals;
3. a third-party async source works through public exports only;
4. unsafe custom-source output is rejected before merge;
5. package exports reject `src/internal`, provider, watch, and deep imports;
6. core manifest/tarball contains no provider SDK, YAML/TOML parser, plugin
   registry, or runtime dependency without an accepted exception ADR.

## Related documents

- [ADR-0001: Core pipeline](./0001-core-pipeline.md)
- [ADR-0002: Layer ordering](./0002-layer-order.md)
- [Architecture diagram](../architecture.md)
- [Scope and non-goals](../scope.md)
- [Normative requirements](../requirements.md)
