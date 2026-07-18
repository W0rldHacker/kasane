# Diff and application-managed reloads

Kasane snapshots are immutable records. Core `1.0` does not watch files or
mutate a live snapshot; the application decides when to create a replacement
and whether to apply it.

## How do I compare two snapshots?

Call `before.diff(after)` after building both through the same public API:

```ts
import { kasane, value } from '@w0rldhacker/kasane';

const before = await kasane({
  layers: [value('defaults', { port: 3000 })],
});
const after = await kasane({
  layers: [value('environment', { port: 8080 })],
});

for (const change of before.diff(after).changes) {
  console.log(change.path, change.type);
}
```

Changes are sorted by canonical path. Objects are compared recursively at leaf
paths. Arrays are atomic, so any array difference produces one change at the
array path rather than per-index edits.

## What change kinds can appear?

| `type` | Meaning | Sides |
| --- | --- | --- |
| `added` | Path exists only after | `after` |
| `removed` | Path exists only before | `before` |
| `value-changed` | Value changed and source did not demonstrably change | `before`, `after` |
| `source-changed` | Equal value came from a different source | `before`, `after` |
| `value-and-source-changed` | Both value and source changed | `before`, `after` |

Each side contains a safe diagnostic `value` and a discriminated `source`.
When provenance is available, source has `available: true`, `kind`, `name`, and
possibly a safe `reference`. With `provenance: 'none'`, it explicitly has
`available: false`; Kasane does not invent a source.

If source information is unavailable on either side, an actual value change is
classified as `value-changed`. Equal values with unavailable source information
produce no change.

## Can diff report only a source change?

Yes. This is useful when a reload moves ownership without changing the effective
value:

```ts
const [change] = before.diff(after).changes;

if (change?.type === 'source-changed') {
  console.log(change.before.source, change.after.source);
}
```

See the executable [source-only diff example](../../examples/diff/index.mjs).

## Are secrets safe in a diff?

Diff sides use the same central redaction policy as `toJSON()` and `explain()`.
A marked secret value is replaced by the diagnostic placeholder and may carry a
versioned `fingerprint` so changes can be compared without retaining plaintext
history. The limitations of keyed and unkeyed fingerprints are explained in
[Secrets and safe diagnostics](./security-and-secrets.md#why-do-secret-histories-contain-fingerprints).

Diff safety depends on correct secret annotation. The raw values remain
available through each snapshot's `value`, `get()`, and `require()` methods.

## How should an application implement reload?

Treat reload as an application transaction:

1. Receive an application-owned trigger.
2. Build a complete new snapshot with a fresh `kasane()` call.
3. Validate it before publishing it.
4. Inspect the safe diff and decide whether the application can apply it.
5. Atomically replace the application's reference to the old snapshot.

If loading, merging, or validation fails, keep using the previous snapshot.
Kasane never returns a partial snapshot. Polling, retries, watchers, rollout
policy, and component restart behavior are application or companion-package
responsibilities.
