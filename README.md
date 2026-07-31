# Kasane

Kasane builds one explainable configuration snapshot from ordered Node.js and
TypeScript sources. Later layers win, objects merge recursively, validation can
transform the result, and every value can retain where it came from.

Kasane is ESM-only and supports Node.js 22 and 24.

## How do I get a configuration value?

Install the package:

```bash
pnpm add @worldhacker/kasane
```

Create `config.json`:

```json
{
  "server": {
    "host": "project.internal",
    "port": 4000
  }
}
```

Then load defaults, the file, and environment values in increasing precedence.
The last layer that supplies `server.port` wins:

<!-- doctest:examples/basic/quick-start.mjs -->

```js
import { fileURLToPath } from 'node:url';

import { env, file, kasane, value } from '@worldhacker/kasane';

const cwd = fileURLToPath(new URL('.', import.meta.url));
const config = await kasane({
  cwd,
  layers: [
    value('defaults', {
      server: { host: '127.0.0.1', port: 3000 },
    }),
    file('application', 'config.json'),
    env('environment', {
      map: {
        APP_SERVER_PORT: { parse: Number, path: 'server.port' },
      },
      source: { APP_SERVER_PORT: '5000' },
    }),
  ],
  provenance: 'full',
});

const port = config.explain('server.port');
console.log(
  JSON.stringify({
    server: config.value.server,
    source: port.origin?.layer.name,
    history: port.history?.map((entry) => entry.origin.layer.name),
  }),
);
```

The output is deterministic:

```json
{
  "server": { "host": "project.internal", "port": 5000 },
  "source": "environment",
  "history": ["defaults", "application", "environment"]
}
```

`source` identifies the winning layer. `history` exists because the example
selects `provenance: 'full'`; the default `origin-only` mode stores only the
current origin. See [Getting started](./docs/guides/getting-started.md) for
optional files, environment modes, and layer ordering.

## How are layers combined?

Sources load sequentially in declaration order. A later defined value replaces
an earlier scalar or array; two objects merge recursively. `undefined` is a
no-op, `null` is a real value, and the `remove` marker deletes a path. Exact
path rules can select `replace`, `merge`, `append`, or `prepend`.

The exhaustive table, path grammar, and removal behavior are in
[Merge and provenance](./docs/guides/merge-and-provenance.md).

## How do I inspect a snapshot safely?

`snapshot.value` is the real configuration and may contain secrets. It is the
only intentionally raw public surface. Use it to configure the application, but
do not log or serialize it.

`snapshot.toJSON()`, `JSON.stringify(snapshot)`, `snapshot.explain()`,
`snapshot.diff()`, error JSON, and Node.js inspection use detached, redacted
diagnostic values. Redaction depends on secret annotations; Kasane cannot
recognize an unmarked secret by inspecting its text.

By default, `snapshot.value` is deeply frozen. `freeze: false` disables that
runtime guard for performance-sensitive applications, but the snapshot still
owns a detached clone. Mutating it cannot change source inputs, and source
mutations cannot change it. The TypeScript surface remains `DeepReadonly<T>`.

Read [Secrets and safe diagnostics](./docs/guides/security-and-secrets.md)
before handling credentials.

## How do validation and TypeScript types work?

Pass a function validator or a Standard Schema V1 object through `validate`.
Kasane gives it a detached mutable value, normalizes its output, and infers the
type of `snapshot.value` from that output.

Without validation, `kasane<MyConfig>(options)` is only an explicit compile-time
assertion. Normalization still rejects unsupported runtime values, but Kasane
has no evidence that the result satisfies `MyConfig`.

[Validation and types](./docs/guides/validation-and-types.md) covers transforms,
failures, Standard Schema, `freeze: false`, and runtime path access.

## How do I compare reloads?

Kasane core does not watch files. Your application decides when to build the
next snapshot, then calls `previous.diff(next)`. Changes distinguish values from
sources, so an identical value supplied by a different layer is visible.

[Diff and reloads](./docs/guides/diff-and-reloads.md) documents all change
kinds, source-only changes, arrays, and secret-safe comparison. The post-`1.0`
[`@worldhacker/kasane-watch` companion](./docs/watch.md) can turn file or
provider notifications into explicit snapshot candidates without adding a watch
export or dependency to core.

## How do I integrate another format or provider?

Use `file(..., { parse })` for another text format, or supply a `LayerSource`
with an async `load(context)` method for another provider. Custom sources,
parsers, and validators are trusted application code. Kasane bounds and
normalizes their returned data; it does not sandbox their execution.

See
[Getting started](./docs/guides/getting-started.md#how-do-i-add-a-custom-parser)
and the executable [custom parser](./examples/custom-parser/index.mjs) and
[custom source](./examples/custom-source/index.mjs) examples.

Companion authors can use the public
[source and parser compatibility kit](./docs/companions.md). It keeps provider
SDKs outside core and verifies failure, abort, secret, dangerous-key, and
no-source-owned-merge behavior.

## What is deliberately outside the core package?

Kasane is a snapshot builder, not a configuration daemon or framework. Core
`1.0` does not include a CLI, file watching, dotenv/YAML parsers, cloud-provider
adapters, framework integrations, secret-manager connectivity, or executable
code sandboxing. See [Limitations and non-goals](./docs/guides/limitations.md)
for the complete boundary.

## Where is the rest of the documentation?

- [Getting started and source loading](./docs/guides/getting-started.md)
- [Merge and provenance](./docs/guides/merge-and-provenance.md)
- [Validation and TypeScript](./docs/guides/validation-and-types.md)
- [Secrets and safe diagnostics](./docs/guides/security-and-secrets.md)
- [Diff and application-managed reloads](./docs/guides/diff-and-reloads.md)
- [Public API map](./docs/guides/public-api.md)
- [Limitations and non-goals](./docs/guides/limitations.md)
- [Platform support](./docs/platform-support.md)
- [Versioning and releases](./docs/versioning.md)
- [Stable maintenance and support](./docs/maintenance.md)
- [Companion sources and formats](./docs/companions.md)
- [Snapshot-based watch companion](./docs/watch.md)
- [Migration policy and guide](./docs/migrations.md)
- [Changelog](./CHANGELOG.md)
- [Security policy](./SECURITY.md)
- [Contributing](./CONTRIBUTING.md)
- [Public API reference](./docs/api.md)
- [Architecture and ADR index](./docs/architecture.md)

## Can I run the examples and checks locally?

The [executable examples](./examples/README.md) cover the quick start, CLI-like
precedence without a CLI package, optional files, environment mapping, backend
validation, custom sources and parsers, secrets, and source-aware diff. Every
example imports the packed public package and has exact-output smoke tests.

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm examples:test
pnpm verify
```

The project uses pnpm 11 as pinned by `packageManager`. The package is built
with `tsc` without bundling.
