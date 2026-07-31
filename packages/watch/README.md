# @worldhacker/kasane-watch

`@worldhacker/kasane-watch` turns file or provider notifications into explicit
Kasane snapshot candidates. It never mutates an existing snapshot and never
applies a candidate automatically.

```ts
import { file, kasane } from '@worldhacker/kasane';
import { watchFiles, watchSnapshots } from '@worldhacker/kasane-watch';

const load = () => ({
  layers: [file('application', 'config.json')],
});
const initial = await kasane(load());
const watcher = watchSnapshots({
  adapters: [watchFiles(['config.json'])],
  build: load,
  initial,
});

for await (const event of watcher) {
  if (event.type === 'error') {
    console.error(event.error);
    continue;
  }

  if (applicationCanApply(event.diff)) {
    event.accept();
  } else {
    event.reject();
  }
}
```

Every trigger invokes `kasane()` with fresh options from `build`. A successful
reload produces a distinct snapshot and a redacted diff. `accept()` explicitly
makes that candidate the last-known-good base for later diffs; rejection or no
decision retains the previous snapshot. A failed reload is a safe `error` event
and also retains the previous snapshot.

## Adapters

`watchFiles()` is exported from both the package root and
`@worldhacker/kasane-watch/file`. It watches parent directories so deletion,
rename, and recreation of a target remain observable on Windows as well as POSIX
platforms. It only emits a value-free trigger; the fresh Kasane call performs
all file reads and parsing.

`watchProvider()` is exported from the root and
`@worldhacker/kasane-watch/provider`. Its factory receives an `AbortSignal` and
returns provider notifications as an `AsyncIterable`. Notification values are
discarded so credentials and SDK objects do not enter watch events.

Filesystem and provider adapters are independent. Provider SDKs belong in the
application or provider companion package, never here or in core.

## Debounce and cancellation

`debounceMs` defaults to 50 milliseconds and accepts 0 through 60,000.
Equivalent triggers within the quiet window collapse into one reload. Abort
closes adapters, ends the iterator, and is combined with any per-build signal
before invoking Kasane.

The filesystem implementation intentionally uses native `fs.watch`. Polling
fallback, retries, resource restart, rollback policy, and automatic config
application are outside this package.

## Compatibility

Version `0.x` requires `@worldhacker/kasane >=1.0.0 <2` and Node.js 22 or newer.
The watch package is independently versioned and does not add an export or a
dependency to core.
