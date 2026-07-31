import type { WatchAdapter, WatchTrigger } from './types.js';

export interface ProviderWatchOptions {
  /** Value-free identifier included in watch events. */
  readonly adapter?: string;
  readonly signal?: AbortSignal;
}

export type ProviderEventFactory = (
  signal: AbortSignal,
) => AsyncIterable<unknown>;

function requireIdentifier(
  value: unknown,
  label: string,
): asserts value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 128) {
    throw new TypeError(
      `${label} must be a non-empty string of at most 128 characters`,
    );
  }
}

/** Maps provider notifications to value-free watch triggers. */
export function watchProvider(
  createEvents: ProviderEventFactory,
  options: ProviderWatchOptions = {},
): WatchAdapter {
  if (typeof createEvents !== 'function') {
    throw new TypeError('createEvents must be a function');
  }
  const adapter = options.adapter ?? 'provider';
  requireIdentifier(adapter, 'options.adapter');
  const controller = new AbortController();
  let consumed = false;

  const abort = (): void => {
    if (!controller.signal.aborted) controller.abort(options.signal?.reason);
  };
  if (options.signal?.aborted === true) abort();
  else options.signal?.addEventListener('abort', abort, { once: true });

  return Object.freeze({
    close(): void {
      options.signal?.removeEventListener('abort', abort);
      abort();
    },
    [Symbol.asyncIterator](): AsyncIterator<WatchTrigger> {
      if (consumed) {
        throw new Error('A provider watch adapter can be consumed only once');
      }
      consumed = true;
      const events = createEvents(controller.signal);
      const iterator = events[Symbol.asyncIterator]();
      const isAborted = (): boolean => controller.signal.aborted;
      return (async function* (): AsyncGenerator<WatchTrigger> {
        try {
          while (!isAborted()) {
            const result = await iterator.next();
            if (result.done) return;
            if (!isAborted()) {
              yield Object.freeze({ adapter, kind: 'provider' });
            }
          }
        } finally {
          void Promise.resolve(iterator.return?.()).catch(() => undefined);
        }
      })();
    },
  });
}
