# Kasane threat model

## Security objective

Kasane protects configuration data as it crosses source, normalization,
validation, merge, snapshot, and diagnostic boundaries. The objective is to
reject structurally unsafe or over-budget data with a controlled `KasaneError`,
prevent partial snapshots after abort, and prevent secret values from entering
diagnostic surfaces.

Kasane is not a JavaScript sandbox and does not make arbitrary executable code
safe.

## Trust boundaries

| Input or component | Trust level | Boundary and guarantee |
| --- | --- | --- |
| File contents, environment contents, and returned source values | Untrusted data | File bytes are bounded before parsing; every returned value is normalized with depth, node, string, type, cycle, and dangerous-key checks before merge. |
| Validator output and Standard Schema issue data | Untrusted data | Validator output is normalized with the same invocation limits; issue count and paths are bounded and third-party messages are discarded. |
| Custom source, custom parser, validator, and Proxy behavior | Trusted executable code | Runs in the application process with application authority. Kasane validates returned data but does not sandbox execution, stop synchronous code, or undo its side effects. |
| Source/parser/validator failures | Untrusted diagnostic input | Arbitrary messages, properties, hooks, and raw causes are discarded. Public errors retain only allowlisted library-controlled summaries. |
| Secret configuration values | Sensitive data | Central structural redaction protects JSON, inspect, explain, validation errors, diff, and lifecycle events. Raw access is explicit through `snapshot.value`. |
| Paths and snapshot lookup calls | Untrusted strings | One bounded parser enforces canonical grammar, length, and segment limits. Every snapshot owns a fixed-size LRU path cache. |
| Lifecycle callback | Trusted executable code | Receives a frozen value-free event. Synchronous throws and rejected promises cannot alter the configuration result or error. |

## Default resource budgets

`kasane({ limits })` may lower or deliberately raise the first four invocation
budgets. Defaults are immutable and apply independently to every source result
and to the validator output.

| Boundary | Default | Enforcement point |
| --- | ---: | --- |
| Configuration depth | 64, root depth is zero | Normalization before merge and after validation |
| Configuration nodes | 100,000 containers and primitives | Normalization before allocating the next node |
| Configuration string | 1,000,000 UTF-8 bytes | Normalization |
| Built-in file source | 10,000,000 bytes | Streaming read before parser invocation |
| Path text | 4,096 JavaScript characters | Shared path parser |
| Path segments | 256 | Shared path parser |
| Snapshot path cache | 256 entries | Per-snapshot LRU eviction |
| Diagnostic traversal | 10,000 visited nodes, depth 64 | Central Redactor |
| Diagnostic container | 1,000 array items or object keys | Central Redactor |
| Diagnostic string | 100,000 characters | Central Redactor |
| Formatted diagnostic | 100,000 characters plus marker | Bounded formatter |
| Standard Schema issues | 1,000 | Validation issue normalization |

Exceeding a configuration or file budget fails the pipeline. Diagnostic
budgets instead preserve safe partial structure and add `[TRUNCATED]`; they
never fall back to raw values.

## Abort model

Layers run strictly sequentially. Abort is checked before a source, after its
load, and after validation. The file adapter also passes the signal to its read
stream. An abort rejects the invocation with a sanitized error; merge state is
invocation-local and no `ConfigSnapshot` is returned.

Abort is cooperative for custom executable code. Kasane cannot preempt a
custom source, parser, validator, or Proxy trap that blocks the JavaScript
thread. Once such code yields or returns, the next pipeline boundary observes
the signal and rejects without publishing partial configuration.

## Explicit non-goals and residual risk

- No in-process sandbox is claimed for custom code or Proxies.
- `AbortSignal` cannot terminate synchronous application code.
- Applications choose file paths, parsers, validators, and custom providers
  and must review those capabilities separately.
- Resource overrides are an explicit application decision; raising them also
  raises worst-case CPU and memory use.
- Security vulnerability disclosure policy and fuzz-suite implementation are
  owned by separate tasks.

## Verification

Security and integration suites cover over-budget files and returned values,
validator output, abort without snapshots, path/cache flooding, poisoned
prototype state, hostile errors and Proxies, and truncation across explain,
diff, and error diagnostics.
