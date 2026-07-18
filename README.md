# Kasane

Kasane is an explainable layered-configuration library for Node.js and
TypeScript with deterministic merging, validation, provenance, redacted
diagnostics, and bounded resource use.

## Development

Prerequisites:

- Node.js 22 or 24;
- Corepack;
- pnpm 11 as pinned by `packageManager`.

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm verify
```

Supported platforms, CI coverage, and filesystem/environment limitations are
documented in [Platform support](./docs/platform-support.md).

The package is ESM-only and is built with `tsc` without bundling.

## Environment variables

Prefix mode maps `__`-separated names to lower-case nested paths and keeps
values as strings by default:

```ts
import { env, kasane } from 'kasane';

const config = await kasane({
  layers: [env('environment', { prefix: 'APP_' })],
});
```

For production, explicit mapping is recommended because every variable, target
path, and conversion is declared:

```ts
env('environment', {
  map: {
    APP_SERVER_PORT: { path: 'server.port', parse: Number },
    APP_DEBUG: { path: 'debug', parse: (value) => value === 'true' },
  },
});
```

`coerce: 'json'` parses only valid JSON; parse failures remain unchanged
strings. Env collisions, empty segments, and dangerous path segments are errors,
never order-dependent overrides. Dotenv loading is intentionally left to the
application.

## Validation

`validate` accepts a synchronous or asynchronous function and infers its output
type. The function receives a detached mutable copy; its result is normalized
again before snapshot creation:

```ts
const config = await kasane({
  layers,
  validate(input) {
    const value = input as { server: { port: string } };
    return { server: { port: Number(value.server.port) } };
  },
});
```

Standard Schema V1 objects are detected structurally through `~standard`, so
schema packages remain optional consumer dependencies. Compatible contract types
are available from `kasane/standard-schema`. Coerced paths retain their input
source with `transformed: true`; schema-added defaults use the synthetic
`validation` source, and removed paths receive validation tombstones.

Standard Schema failures expose sorted canonical `ConfigIssue` records on the
`KasaneValidationError`. Each issue uses a library-controlled reason and, when
available, includes its safe source reference, centrally redacted received
value, and the previous value/origin in `full` provenance mode. Third-party
issue messages and raw thrown errors are never copied into serialized
diagnostics.

## TypeScript API

With a function validator or Standard Schema, `snapshot.value` is inferred from
the validator output and exposed as `DeepReadonly<T>`. Without a validator,
`kasane<T>(options)` is an explicit user assertion: Kasane normalizes the data
but cannot prove that it matches `T`.

Runtime paths deliberately stay lightweight. Both `snapshot.get(path)` and
`snapshot.require(path)` return `unknown`, including for string literals; Kasane
does not generate recursive typed-path unions that can slow the language server.

## Snapshot diff

`snapshot.diff(other)` compares validated normalized values and their stable
source identity. Object changes are reported at leaf paths, while arrays are
atomic values. The result distinguishes `added`, `removed`, `value-changed`,
`source-changed`, and `value-and-source-changed` in deterministic path order.
Secret values remain redacted and can carry their versioned fingerprint. When
provenance is disabled, diff sides explicitly use `{ available: false }` rather
than inventing a source.

## Secret annotations

Secret sensitivity is stored in provenance for current values and history. A
secret layer marks every value it supplies:

```ts
import { secret, secretValue, value } from 'kasane';

secret('runtime-secrets', async () => loadSecrets());

value('application', {
  apiToken: secretValue(process.env.API_TOKEN),
});
```

Any descriptor may set `secret: true`. Exact and single-segment-wildcard path
policies can protect public source layers:

```ts
await kasane({
  fingerprintKey: applicationFingerprintKey,
  layers,
  secrets: ['database.password', 'integrations.*.token'],
});
```

`*` matches exactly one segment; recursive `**` is unsupported. A later public
value clears the current value-level annotation unless a path policy still
matches. Earlier secret history remains secret. This API annotates values; it
does not connect to or replace a secret manager.

With `provenance: 'full'`, secret leaf history stores a versioned SHA-256
fingerprint instead of plaintext. `fingerprintKey` switches this to HMAC-SHA-256
and is never copied into snapshot metadata. Unkeyed fingerprints of low-entropy
values are vulnerable to offline guessing, so they are not password hashes and
do not replace secret storage or encryption.

## Safe diagnostics

`snapshot.value` is the only intentionally raw configuration surface. Direct
`toJSON()`, `JSON.stringify(snapshot)`, and `util.inspect(snapshot)` all use the
same structural redaction policy and return detached trees. Secret leaves are
replaced with `[REDACTED]`, while public siblings remain visible. A public value
that is literally equal to that placeholder remains a normal public value; the
placeholder itself is not used to infer sensitivity.

Kasane errors expose only allowlisted details and detached cause summaries.
There is no debug or formatting option that makes secret values printable.

## Resource limits and trust boundary

Every source result and validator output crosses the same configurable
normalization limits. The built-in file source also limits bytes before calling
its parser:

```ts
const config = await kasane({
  layers,
  limits: {
    maxDepth: 64,
    maxNodes: 100_000,
    maxSourceBytes: 10_000_000,
    maxStringLength: 1_000_000,
  },
});
```

These values are the defaults. Paths, per-snapshot caches, validation issues,
and diagnostic traversal/formatting have fixed defensive budgets as described in
the [threat model](docs/threat-model.md).

Custom sources, parsers, validators, and Proxy traps are trusted executable code
running with application authority. Kasane bounds and validates the data they
return; it does not sandbox their execution.

## Origin and explanation

Every found path can report its current resolved origin when provenance is
enabled. Containers report their latest structural operation, while `explain()`
marks containers whose descendants came from different origins:

```ts
const origin = config.origin('server.port');
console.log(origin?.layer.name, origin?.operation);

const explanation = config.explain('server');
console.log(explanation.found, explanation.format());
```

Missing paths return a structured result with the nearest known path and, when
applicable, removal metadata instead of throwing. Ordered history is included
only with `provenance: 'full'`; `origin-only` remains the default and `none`
disables origin diagnostics. Explanation values and formatter output always use
the central redaction policy. The formatter is deterministic, bounded, and
ANSI-free.
