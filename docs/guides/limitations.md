# Limitations and non-goals

Kasane core `1.0` intentionally stays a small snapshot-building library. These
boundaries prevent examples and guides from promising an API that does not
ship.

## What does core not do?

| Area | Core `1.0` boundary |
| --- | --- |
| CLI | No executable or CLI parsing package; pass an application-parsed object as a final `value` layer |
| Watch and reload | No filesystem watcher, polling, retries, remote synchronization, or live snapshot mutation |
| Cloud and secret providers | No Vault, Kubernetes, AWS, Azure, GCP, or other provider clients |
| File formats | Built-in file parsing is JSON; no YAML, TOML, dotenv, or executable JavaScript config |
| Frameworks | No dependency-injection container or application-framework integration |
| Validation | No proprietary schema language and no mandatory schema package |
| Merge extensions | No callbacks, wildcard rules, array deduplication, or computed-value dependency graph |
| Typed paths | No recursive compile-time string-path unions; runtime access returns `unknown` |
| Observability transport | No OpenTelemetry, `diagnostics_channel`, or global event publisher |
| Code isolation | No sandbox for custom sources, parsers, validators, provider SDKs, or Proxy traps |
| Secret storage | No secret-manager connection, encryption, memory locking, or raw-secret diagnostic switch |
| Policy platform | No feature-flag, deployment-policy, or infrastructure-policy engine |

Some capabilities can be built by applications today through public contracts:

- parse CLI arguments in the application and add them as the last `value`
  layer;
- load dotenv before calling `kasane()`, or use a reviewed custom parser;
- implement a provider as a `LayerSource` without deep imports;
- create fresh snapshots on an application-owned reload trigger and compare
  them with `diff()`.

Those patterns do not make CLI, dotenv, providers, or watching part of core.
Future companion packages may cover them without changing the `1.0` promise.

## Which runtime limitations matter?

- The package is ESM-only and supports the platforms listed in
  [Platform support](../platform-support.md).
- Sources execute sequentially. A slow custom source delays later layers.
- Abort is cooperative for custom code and cannot preempt synchronous
  JavaScript.
- Values must fit Kasane's normalized configuration model and resource limits.
- Arrays are atomic for default merge, provenance comparison, and diff.
- Merge rules match exact canonical paths; secret policies support only exact
  paths and one-segment `*` wildcards.
- Full provenance retains more history and therefore uses more memory than
  `origin-only` or `none`.
- `freeze: false` removes runtime mutation protection but not clone cost or the
  readonly TypeScript contract.
- Secret safety depends on correct annotation and disciplined handling of raw
  snapshot values.

## Where is the normative scope?

The complete release boundary and non-goal IDs are maintained in
[Project scope](../scope.md). Security exclusions are in the
[threat model](../threat-model.md), and merge details are fixed by
[Merge semantics](../merge-semantics.md).
