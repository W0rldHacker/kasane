# Validation and TypeScript

Validation runs after all layers have merged and before the immutable snapshot
is created. It is the point where an application proves, transforms, or
defaults its final configuration.

## How do I validate with a function?

The validator receives a detached mutable clone, may be synchronous or
asynchronous, and returns the value that becomes `snapshot.value`:

```ts
import { kasane, value } from 'kasane';

const snapshot = await kasane({
  layers: [value('environment', { port: '8080' })],
  validate(input) {
    const candidate = input as { port?: unknown };
    const port = Number(candidate.port);
    if (!Number.isInteger(port) || port < 1 || port > 65_535) {
      throw new Error('Invalid port');
    }
    return { port };
  },
});

// DeepReadonly<{ port: number }>
snapshot.value;
```

Kasane normalizes the returned value again. A validator cannot smuggle class
instances, cycles, unsafe keys, oversized structures, or other unsupported
values into a snapshot. A thrown value is wrapped in a sanitized
`KasaneValidationError`; raw exception messages are not copied into serialized
diagnostics.

## How do I use a schema library?

Kasane accepts a Standard Schema V1 object by its `~standard` contract. Install
the schema package in the application and pass its schema directly; Kasane has
no runtime dependency on that library.

```ts
import { kasane, value } from 'kasane';
import type { StandardSchemaV1 } from 'kasane/standard-schema';

type Output = { port: number };

const schema: StandardSchemaV1<unknown, Output> = {
  '~standard': {
    validate(input) {
      const port = Number((input as { port?: unknown }).port);
      return Number.isInteger(port)
        ? { value: { port } }
        : { issues: [{ message: 'Invalid port', path: ['port'] }] };
    },
    vendor: 'example',
    version: 1,
  },
};

const snapshot = await kasane({
  layers: [value('input', { port: '8080' })],
  validate: schema,
});
```

`isStandardSchemaV1` is available from `kasane/standard-schema` for structural
detection. That is the only supported package subpath; do not import Kasane
internals.

## What does a validation failure contain?

Standard Schema failures become a `KasaneValidationError` with sorted canonical
`ConfigIssue` records. Each issue uses a Kasane-controlled reason and may carry
its canonical path, safe source reference, redacted received value, and, in
`full` provenance mode, a redacted previous value/origin.

Third-party issue messages and arbitrary properties are intentionally excluded
from JSON diagnostics. Catch the error by class and use its stable `code` and
allowlisted `details`, not the schema library's prose:

```ts
import { KasaneValidationError } from 'kasane';

try {
  await loadConfiguration();
} catch (error) {
  if (error instanceof KasaneValidationError) {
    console.error(JSON.stringify(error));
  }
}
```

The executable [backend example](../../examples/backend/index.mjs) tests both a
successful transform and a failed validation.

## Does validation preserve provenance?

Yes. A path whose value survives unchanged keeps its source. A transformed path
keeps its input source and sets `transformed: true`. A schema-added default uses
the synthetic `validation` source. A removed path retains a validation
tombstone. This reconciliation happens by value shape, not by retaining aliases
to validator-owned data.

## What type is `snapshot.value`?

With a function validator or Standard Schema, Kasane infers the validator's
output and exposes it as `DeepReadonly<T>`. Source layers intentionally return
unknown data and do not independently determine the final type.

Without validation, an explicit generic is an assertion made by the caller:

```ts
import { kasane, value } from 'kasane';

interface AppConfig {
  readonly port: number;
}

const snapshot = await kasane<AppConfig>({
  layers: [value('application', { port: 8080 })],
});
```

This does not validate `AppConfig` at runtime. Kasane still normalizes the tree,
but a mistaken assertion can make TypeScript disagree with the actual value.
Use a validator whenever runtime certainty matters.

`get(path)` and `require(path)` return `unknown`, even when the path is a string
literal. This avoids enormous recursive path unions and keeps compilation
costs bounded. Narrow the returned value or use the typed `snapshot.value`.

## What changes when I set `freeze: false`?

The default `freeze: true` recursively freezes the snapshot-owned value.
`freeze: false` skips that runtime operation. It does not enable structural
sharing: Kasane still detaches sources, merge inputs, and validation output.

The public type stays `DeepReadonly<T>` in both modes because snapshot mutation
is unsupported. With `freeze: false`, JavaScript can bypass that type and mutate
the raw value, so application code is responsible for treating it as immutable.
Safe diagnostic outputs such as `toJSON()` remain detached from the raw value.
