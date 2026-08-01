# RFC-0002: Opt-in telemetry adapters

- Status: Draft — hold for external consumer evidence
- Owner: `POST-004`
- Stable API impact: none

## User evidence and hypothesis

Core lifecycle events already satisfy the internal observability use case and
are value-free. The POST-004 sponsor requested OpenTelemetry and
`diagnostics_channel` research, but prerelease feedback contains no request for
either transport.

Hypothesis: services already using OpenTelemetry want source/merge/validation
latency without writing repetitive event mapping. Promotion requires two
independent services naming their tracer setup and required attributes.

## Prototype contract

The prototype accepts the public `KasaneEventCallback` boundary and maps it to a
structural tracer port. It has no OpenTelemetry SDK dependency. Only these
attributes are copied: event type, layer, kind, duration, node count, and
success. Unknown properties are discarded. A separate explicit bridge publishes
the same allowlisted record to `kasane.lifecycle.v1` through Node's
`diagnostics_channel`.

Adapters are composed with a hard maximum of four. Adapter exceptions are
isolated. There is no global default publisher, registration API, exporter,
credential handling, log body, configuration value, path, source reference, or
arbitrary attribute callback.

## Performance and security budgets

- 100,000 mapped lifecycle events SHOULD complete within 1 second on the local
  research gate;
- adapter overhead MUST remain below 50 times a no-op callback, with a 10 ms
  noise allowance;
- active span state MUST be bounded to 256 pipeline stage/layer pairs and
  cleared at end events; excess unmatched starts are dropped;
- secret-canary tests MUST cover hostile extra event properties, tracer capture,
  channel subscribers, and JSON serialization;
- subscriber/tracer failures MUST NOT change `kasane()` results.

Layer names and source kinds are safe identities only when applications follow
the existing rule not to place credentials in metadata.

## Review decision

Keep the dependency-free mapper prototype. Do not publish an OTel package or
enable a global channel until consumer/exporter evidence exists.
