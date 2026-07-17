# Kasane

Kasane is an explainable layered-configuration library for Node.js and
TypeScript. Runtime implementation has not started; the current repository
contains the accepted product/architecture baseline and a reproducible strict
toolchain.

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
  layers,
  secrets: ['database.password', 'integrations.*.token'],
});
```

`*` matches exactly one segment; recursive `**` is unsupported. A later public
value clears the current value-level annotation unless a path policy still
matches. Earlier secret history remains secret. This API annotates values; it
does not connect to or replace a secret manager.

## Safe diagnostics

`snapshot.value` is the only intentionally raw configuration surface. Direct
`toJSON()`, `JSON.stringify(snapshot)`, and `util.inspect(snapshot)` all use the
same structural redaction policy and return detached trees. Secret leaves are
replaced with `[REDACTED]`, while public siblings remain visible. A public value
that is literally equal to that placeholder remains a normal public value; the
placeholder itself is not used to infer sensitivity.

Kasane errors expose only allowlisted details and detached cause summaries.
There is no debug or formatting option that makes secret values printable.

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
