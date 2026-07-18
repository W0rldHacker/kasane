# Getting started and source loading

This guide answers how to assemble layers and connect configuration inputs. For
the shortest working program, start with the [README quick start](../../README.md#how-do-i-get-a-configuration-value).

## Which layer wins?

`kasane({ layers })` evaluates enabled layers from first to last. Put broad
defaults first and the most specific overrides last:

```ts
import { env, file, kasane, value } from 'kasane';

const snapshot = await kasane({
  layers: [
    value('defaults', { log: { level: 'info' }, port: 3000 }),
    file('project', 'config.json'),
    file('local', 'config.local.json', { optional: true }),
    env('environment', {
      map: { APP_PORT: { parse: Number, path: 'port' } },
    }),
  ],
});
```

Sources load strictly sequentially, even when `load()` is asynchronous. A later
source therefore observes the world after every earlier source has finished.
Kasane does not start all sources concurrently, reorder them, retry them, or
poll them. A disabled descriptor (`enabled: false`) is skipped.

Relative file paths resolve against `cwd`; without it they resolve against the
process working directory captured for the invocation. An `AbortSignal` passed
as `signal` applies to the complete pipeline and is also available to custom
sources through their context.

## What happens when an optional file is missing?

`file(name, path, { optional: true })` suppresses only a missing-file `ENOENT`
and contributes no value. Invalid JSON, permission errors, oversized files, and
other read failures still fail the layer. JSON is the default parser and files
are read as bounded UTF-8 input.

```ts
import { file, kasane } from 'kasane';

const snapshot = await kasane({
  cwd: process.cwd(),
  layers: [file('local', 'config.local.json', { optional: true })],
});
```

An invocation still needs at least one materialized root value; an optional
file cannot be the only absent input.

## How should environment variables map to paths?

Explicit mode is recommended for application configuration. Once `map` is
present, only declared variable names are read:

```ts
import { env } from 'kasane';

const environment = env('environment', {
  map: {
    APP_DEBUG: {
      parse: (text) => text === 'true',
      path: 'debug',
    },
    APP_SERVER_PORT: { parse: Number, path: 'server.port' },
  },
});
```

Prefix mode maps every matching name. The default separator is `__`, and path
segments become lowercase by default. For example,
`APP_DATABASE__HOST=localhost` becomes `database.host`:

```ts
env('environment', {
  case: 'lower',
  prefix: 'APP_',
  separator: '__',
});
```

Set `case: 'preserve'` to retain segment case. Values remain strings unless an
explicit entry has a `parse` function or the layer sets `coerce: 'json'`.
JSON coercion parses valid JSON values and leaves invalid JSON as the original
string. An explicit parser may be asynchronous; its failure becomes a sanitized
source error.

Kasane snapshots and sorts the environment input before mapping. Duplicate
paths, parent/child collisions, empty segments, case collisions, and dangerous
prototype-related segments are errors rather than order-dependent overrides.
Use `source` only to inject an `EnvSource` for tests or embedding; the default is
`process.env`.

Kasane does not load `.env` files. Load them in the application before calling
Kasane, or add a trusted custom source.

## How do I add a custom parser?

Provide `parse` to the built-in file layer. It receives the complete UTF-8 text
after the byte limit has been enforced and may return a value or promise:

```ts
import { file, kasane } from 'kasane';

const snapshot = await kasane({
  layers: [
    file('settings', 'settings.conf', {
      parse(text) {
        return Object.fromEntries(
          text
            .trim()
            .split(/\r?\n/u)
            .map((line) => line.split('=', 2)),
        );
      },
    }),
  ],
});
```

Format libraries such as YAML parsers belong in the application's dependencies,
not Kasane's runtime dependencies. See the executable
[custom parser example](../../examples/custom-parser/index.mjs).

## How do I add a custom source?

A `LayerDescriptor` contains a name, optional `enabled` and `secret` flags, and
a `LayerSource`. `load(context)` may be synchronous or asynchronous:

```ts
import { kasane, type LayerDescriptor } from 'kasane';

const remote: LayerDescriptor = {
  name: 'application-provider',
  source: {
    kind: 'custom',
    async load({ cwd, limits, signal }) {
      return readApplicationConfig({ cwd, limits, signal });
    },
  },
};

const snapshot = await kasane({ layers: [remote] });
```

`SourceContext` contains `cwd`, `signal`, and the applicable source byte limit.
Returned data crosses the same normalization and size boundaries as built-in
sources. `SourceMetadata` describes safe provider-reference shapes, but core
`1.0` has no public custom metadata registration hook: `load()` must return the
configuration value itself, not a `LoadedLayer` envelope. Keep configuration
values and credentials out of layer names and thrown messages.

Custom sources are trusted executable code with application authority. Kasane
does not time out or sandbox them. See the executable
[custom source example](../../examples/custom-source/index.mjs).

## Which source helper should I use?

| Input | Helper | Important options |
| --- | --- | --- |
| In-memory defaults or overrides | `value(name, data)` | `enabled`, `secret` |
| UTF-8 file | `file(name, path)` | `enabled`, `optional`, `parse`, `secret` |
| Environment | `env(name)` | `case`, `coerce`, `enabled`, `map`, `prefix`, `secret`, `separator`, `source` |
| Secret value or loader | `secret(name, input)` | `enabled`; all descendants are secret |
| Application/provider adapter | `LayerDescriptor` with `LayerSource` | application-defined `kind` and `load` |

Source helpers describe data acquisition, not reload policy. Build a new
snapshot whenever your application decides configuration should be refreshed,
then use [snapshot diff](./diff-and-reloads.md).
