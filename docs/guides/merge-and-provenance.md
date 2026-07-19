# Merge and provenance

This guide answers what later layers do to earlier values and how to explain the
result. The normative engine contract is [Merge semantics](../merge-semantics.md).

## What values can Kasane merge?

After normalization, a configuration value is `null`, a boolean, a finite
number, a string, a dense array, or a plain object composed only of those
values. Class instances, functions, symbols, bigints, sparse arrays, accessors,
cycles, dangerous keys, and non-finite numbers are rejected.

`undefined`, `remove`, and absence are control states rather than stored values:

- an omitted property or incoming `undefined` does nothing;
- `remove` deletes a path and records a tombstone when provenance is enabled;
- `null` is a real configuration value and replaces the old value.

## What is the complete default merge matrix?

This table covers every existing state and incoming kind. It is checked against
the same JSON fixture used by the unit suite.

<!-- merge-matrix:start -->
| Existing \ incoming | `undefined` | `remove` | `null` | `boolean` | `number` | `string` | `array` | `object` |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `absent` | `no-op` | `remove` | `set` | `set` | `set` | `set` | `set` | `set` |
| `null` | `no-op` | `remove` | `replace` | `replace` | `replace` | `replace` | `replace` | `replace` |
| `boolean` | `no-op` | `remove` | `replace` | `replace` | `replace` | `replace` | `replace` | `replace` |
| `number` | `no-op` | `remove` | `replace` | `replace` | `replace` | `replace` | `replace` | `replace` |
| `string` | `no-op` | `remove` | `replace` | `replace` | `replace` | `replace` | `replace` | `replace` |
| `array` | `no-op` | `remove` | `replace` | `replace` | `replace` | `replace` | `replace` | `replace` |
| `object` | `no-op` | `remove` | `replace` | `replace` | `replace` | `replace` | `replace` | `merge` |
<!-- merge-matrix:end -->

Object/object is the only recursive default. Arrays are atomic and replace old
arrays unless an exact rule says otherwise. When an object is replaced, rules
for its unvisited children do not run.

## How do I override the default at one path?

Declare exact canonical paths through `merge`:

```ts
import { kasane, value } from '@worldhacker/kasane';

const snapshot = await kasane({
  layers: [
    value('defaults', { plugins: ['core'], server: { host: 'localhost' } }),
    value('project', { plugins: ['metrics'], server: { port: 8080 } }),
  ],
  merge: {
    plugins: 'append',
    server: 'merge',
  },
});
```

| Strategy | Required present pair | Result |
| --- | --- | --- |
| `replace` | any value / any value | Incoming subtree replaces existing subtree |
| `merge` | object / object | Recursive object merge |
| `append` | array / array | Existing elements followed by incoming elements |
| `prepend` | array / array | Incoming elements followed by existing elements |

`merge`, `append`, and `prepend` fail on an incompatible present pair. An absent
path may first be initialized without combining. Append and prepend preserve
order and do not deduplicate.

Paths use dots between segments. Escape a literal dot as `\.` and a literal
backslash as `\\`; the empty string addresses the root. Matching is exact:
`server` does not automatically govern `server.host`, and `*` has no wildcard
meaning in merge declarations. Duplicate paths after canonicalization fail at
startup.

The `remove` export is a unique marker, not a merge strategy. A string
`"remove"` remains an ordinary string. The marker is allowed at the root or as
an object property value, not inside arrays.

## Which provenance mode should I choose?

| Mode | Stored information | Use when |
| --- | --- | --- |
| `origin-only` | Current winning origin and removal tombstones | Default; answer where the current value came from |
| `full` | Current origin plus ordered value/operation history | Audits and detailed explanations justify the memory cost |
| `none` | No origin tree | Only the final value matters |

Provenance tracks source identity, operation, scope, input reference, secret
state, and whether validation transformed a value. It does not store arbitrary
source objects. `origin-only` is the default.

## How do I read values and origins?

`snapshot.get(path)` returns `unknown` or `undefined`, `has(path)` tests
existence, and `require(path)` returns `unknown` or throws a sanitized
`KasanePathError`. These runtime methods deliberately do not create recursive
typed-path unions.

`origin(path)` returns the current `Origin` when provenance is available.
`explain(path)` returns a discriminated `Explanation`:

```ts
const result = snapshot.explain('server.port');

if (result.found) {
  console.log(result.value, result.origin?.layer.name);
} else {
  console.log(result.nearest, result.removal?.layer.name);
}

console.log(result.format());
```

Found containers may set `mixed: true` when their descendants have different
origins. Missing explanations include the nearest known path and may include
the removal that made the requested path absent. `history` appears only in
`full` mode. Values and formatted explanations are redacted and bounded.

Origin layer numeric IDs are stable only inside one snapshot. To compare two
snapshots, use their names/kinds through [snapshot diff](./diff-and-reloads.md),
not numeric IDs.
