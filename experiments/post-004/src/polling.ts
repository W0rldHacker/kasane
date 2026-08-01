import type { WatchAdapter, WatchTrigger } from '@worldhacker/kasane-watch';

export interface RemotePollOptions {
  readonly adapter?: string;
  readonly intervalMs?: number;
  readonly maxPolls?: number;
  readonly probe: (signal: AbortSignal) => boolean | Promise<boolean>;
  readonly signal?: AbortSignal;
}

function boundedInteger(
  value: unknown,
  fallback: number | undefined,
  minimum: number,
  maximum: number,
  label: string,
): number | undefined {
  const resolved = value ?? fallback;
  if (
    resolved !== undefined &&
    (typeof resolved !== 'number' ||
      !Number.isSafeInteger(resolved) ||
      resolved < minimum ||
      resolved > maximum)
  ) {
    throw new TypeError(
      `${label} must be an integer from ${String(minimum)} through ${String(maximum)}`,
    );
  }
  return resolved;
}

function delay(milliseconds: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(done, milliseconds);
    function done(): void {
      clearTimeout(timer);
      signal.removeEventListener('abort', done);
      resolve();
    }
    signal.addEventListener('abort', done, { once: true });
  });
}

/** Value-free, single-flight polling prototype for the watch lifecycle. */
export function pollRemote(options: RemotePollOptions): WatchAdapter {
  if (typeof options.probe !== 'function') {
    throw new TypeError('Remote polling requires one probe function');
  }
  const adapter = options.adapter ?? 'remote-poll';
  if (adapter.length === 0 || adapter.length > 128) {
    throw new TypeError('Remote poll adapter must contain 1 to 128 characters');
  }
  const intervalMs = boundedInteger(
    options.intervalMs,
    1_000,
    10,
    300_000,
    'intervalMs',
  );
  if (intervalMs === undefined) {
    throw new TypeError('intervalMs default could not be resolved');
  }
  const maxPolls = boundedInteger(
    options.maxPolls,
    undefined,
    1,
    1_000_000,
    'maxPolls',
  );
  const controller = new AbortController();
  const isAborted = (): boolean => controller.signal.aborted;
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
      if (consumed)
        throw new Error('Remote poll adapter can be consumed only once');
      consumed = true;
      return (async function* (): AsyncGenerator<WatchTrigger> {
        let polls = 0;
        try {
          while (!isAborted()) {
            const changed = await options.probe(controller.signal);
            polls += 1;
            if (isAborted()) return;
            if (changed) yield Object.freeze({ adapter, kind: 'provider' });
            if (maxPolls !== undefined && polls >= maxPolls) return;
            await delay(intervalMs, controller.signal);
          }
        } finally {
          options.signal?.removeEventListener('abort', abort);
          abort();
        }
      })();
    },
  });
}
