# Snapshot-based watch companion

Core Kasane remains a one-shot immutable snapshot builder. The independently
versioned `@worldhacker/kasane-watch` companion coordinates reload triggers
while keeping the final application decision explicit.

## Lifecycle

For each debounced trigger batch, the watcher:

1. asks the application for fresh `KasaneOptions`;
2. calls public `kasane()` with a cancellation signal;
3. emits a safe error event when the build fails, retaining last-known-good;
4. otherwise computes `previous.diff(candidate)` and emits the new candidate;
5. changes last-known-good only if the application calls `accept()`.

The old and candidate snapshots remain separate immutable objects. Calling
`reject()`, making no decision, or receiving an error does not destroy or
replace the previous snapshot. Applying configuration to services, restarting
resources, and rollback policy remain application responsibilities.

## Adapter boundary

File and provider notification sources are separate:

- `watchFiles()` uses native Node `fs.watch` on parent directories. Watching a
  directory rather than a file handle preserves notifications across common
  delete/rename/recreate sequences, including Windows behavior.
- `watchProvider()` maps an application/provider-owned `AsyncIterable` to
  value-free triggers. Its factory receives an `AbortSignal`; yielded SDK
  values are deliberately discarded.

Neither adapter reads configuration values, calls merge code, or controls
application state. Provider SDK dependencies stay in their provider companion.

Native filesystem events may be duplicated, coalesced, or omit a filename.
The adapter treats a missing filename as a possible match and the watcher
debounces duplicates. Polling fallback would introduce a separate resource and
latency budget and is not part of this package.

## Events and secret safety

Snapshot events contain `previous`, `snapshot`, the core redacted `diff`, and
`accept()`/`reject()` functions. Raw values are available only through the
snapshots' explicit raw accessors, exactly as in core. Serializing an event uses
each snapshot's redacted `toJSON()` behavior.

Reload errors preserve only core's allowlisted `KASANE_*` name, code, and
message. Arbitrary builder/adapter failures become generic value-free error
records. No raw cause or provider notification is placed in an event.

## Verification

```bash
pnpm --filter @worldhacker/kasane-watch test
pnpm --filter @worldhacker/kasane-watch pack:check
```

The integration suite covers rapid writes, invalid replacement, cancellation,
deleted and recreated optional files, secret diff redaction, application
accept/reject, and real native filesystem events on the platform running CI.
Required Windows CI runs this suite directly.
