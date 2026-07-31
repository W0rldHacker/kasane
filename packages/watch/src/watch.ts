import { kasane } from '@worldhacker/kasane';
import type {
  ConfigSnapshot,
  InferValidationOutput,
  KasaneOptions,
  ValidationAdapter,
} from '@worldhacker/kasane';

import { AsyncQueue } from './queue.js';
import type {
  SnapshotWatchEvent,
  SnapshotWatcher,
  SnapshotWatchOptions,
  ValidatedSnapshotWatchOptions,
  WatchAdapter,
  WatchError,
  WatchReloadContext,
  WatchTrigger,
} from './types.js';

type RuntimeBuild = (context: WatchReloadContext<unknown>) => unknown;

interface RuntimeOptions {
  readonly adapters: readonly WatchAdapter[];
  readonly build: RuntimeBuild;
  readonly debounceMs?: number;
  readonly initial: ConfigSnapshot<unknown>;
  readonly signal?: AbortSignal;
}

type ReloadInput =
  | { readonly error: unknown; readonly type: 'adapter-error' }
  | { readonly triggers: readonly WatchTrigger[]; readonly type: 'triggers' };

const invokeKasane = kasane as (
  options: KasaneOptions,
) => Promise<ConfigSnapshot<unknown>>;

function validateDebounce(value: unknown): number {
  if (value === undefined) return 50;
  if (!Number.isInteger(value) || Number(value) < 0 || Number(value) > 60_000) {
    throw new TypeError('debounceMs must be an integer from 0 through 60000');
  }
  return Number(value);
}

function normalizeTrigger(value: unknown): WatchTrigger {
  if (typeof value !== 'object' || value === null) {
    throw new TypeError('Watch adapter yielded a non-object trigger');
  }
  const input = value as Record<PropertyKey, unknown>;
  const adapter = input['adapter'];
  const kind = input['kind'];
  if (
    typeof adapter !== 'string' ||
    adapter.length === 0 ||
    adapter.length > 128
  ) {
    throw new TypeError('Watch trigger adapter must be a bounded string');
  }
  if (kind !== 'file' && kind !== 'provider') {
    throw new TypeError('Watch trigger kind must be file or provider');
  }
  return Object.freeze({ adapter, kind });
}

function safeError(error: unknown, stage: 'adapter' | 'reload'): WatchError {
  if (typeof error === 'object' && error !== null) {
    const input = error as Record<PropertyKey, unknown>;
    const code = input['code'];
    const name = input['name'];
    const message = input['message'];
    if (
      typeof code === 'string' &&
      code.startsWith('KASANE_') &&
      typeof name === 'string' &&
      typeof message === 'string'
    ) {
      return Object.freeze({ code, message, name });
    }
  }
  return Object.freeze({
    message: stage === 'adapter' ? 'Watch adapter failed' : 'Reload failed',
    name: stage === 'adapter' ? 'WatchAdapterError' : 'WatchReloadError',
  });
}

function distinctTriggers(
  pending: readonly WatchTrigger[],
): readonly WatchTrigger[] {
  const seen = new Set<string>();
  const result: WatchTrigger[] = [];
  for (const trigger of pending) {
    const key = `${trigger.kind}\u0000${trigger.adapter}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(trigger);
    }
  }
  return Object.freeze(result);
}

export function watchSnapshots<Validation extends ValidationAdapter>(
  options: ValidatedSnapshotWatchOptions<Validation>,
): SnapshotWatcher<InferValidationOutput<Validation>>;
export function watchSnapshots<T = unknown>(
  options: SnapshotWatchOptions<T>,
): SnapshotWatcher<T>;
export function watchSnapshots(options: unknown): SnapshotWatcher<unknown> {
  if (typeof options !== 'object' || options === null) {
    throw new TypeError('Watch options must be an object');
  }
  const runtime = options as RuntimeOptions;
  if (!Array.isArray(runtime.adapters) || runtime.adapters.length === 0) {
    throw new TypeError('Watch options require at least one adapter');
  }
  if (typeof runtime.build !== 'function') {
    throw new TypeError('Watch options require a build function');
  }
  const debounceMs = validateDebounce(runtime.debounceMs);
  const controller = new AbortController();
  const output = new AsyncQueue<ReloadInput>();
  let lastKnownGood = runtime.initial;
  let consumed = false;
  let closed = false;
  let pending: WatchTrigger[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  let activeAdapters = runtime.adapters.length;
  let closePromise: Promise<void> | undefined;
  const isStopped = (): boolean => closed || controller.signal.aborted;

  const flush = (): void => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    if (pending.length === 0 || closed) return;
    const triggers = distinctTriggers(pending);
    pending = [];
    output.push({ triggers, type: 'triggers' });
  };
  const schedule = (trigger: WatchTrigger): void => {
    if (closed) return;
    pending.push(trigger);
    if (timer !== undefined) clearTimeout(timer);
    if (debounceMs === 0) flush();
    else timer = setTimeout(flush, debounceMs);
  };
  const adapterDone = (): void => {
    activeAdapters -= 1;
    if (activeAdapters === 0 && !closed) {
      flush();
      output.close();
    }
  };

  for (const adapter of runtime.adapters) {
    void (async () => {
      try {
        for await (const rawTrigger of adapter) {
          if (controller.signal.aborted) return;
          schedule(normalizeTrigger(rawTrigger));
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          flush();
          output.push({ error, type: 'adapter-error' });
        }
      } finally {
        adapterDone();
      }
    })();
  }

  const close = (): Promise<void> => {
    closePromise ??= (async () => {
      if (closed) return;
      closed = true;
      if (timer !== undefined) clearTimeout(timer);
      pending = [];
      if (!controller.signal.aborted) controller.abort(runtime.signal?.reason);
      output.close();
      await Promise.allSettled(
        runtime.adapters.map(async (adapter) => adapter.close()),
      );
      runtime.signal?.removeEventListener('abort', externalAbort);
    })();
    return closePromise;
  };
  const externalAbort = (): void => {
    void close();
  };
  if (runtime.signal?.aborted === true) void close();
  else runtime.signal?.addEventListener('abort', externalAbort, { once: true });

  const events = async function* (): AsyncGenerator<
    SnapshotWatchEvent<unknown>
  > {
    try {
      for await (const input of output) {
        if (closed || controller.signal.aborted) return;
        if (input.type === 'adapter-error') {
          yield Object.freeze({
            error: safeError(input.error, 'adapter'),
            previous: lastKnownGood,
            stage: 'adapter',
            triggers: Object.freeze([]),
            type: 'error',
          });
          continue;
        }

        const previous = lastKnownGood;
        try {
          const context = Object.freeze({
            previous,
            signal: controller.signal,
            triggers: input.triggers,
          });
          const built = await runtime.build(context);
          if (typeof built !== 'object' || built === null) {
            throw new TypeError('Watch build must return Kasane options');
          }
          const buildOptions = built as KasaneOptions;
          const reloadSignal =
            buildOptions.signal === undefined
              ? controller.signal
              : AbortSignal.any([controller.signal, buildOptions.signal]);
          const snapshot = await invokeKasane({
            ...buildOptions,
            signal: reloadSignal,
          });
          if (isStopped()) return;
          let decision: 'accepted' | 'pending' | 'rejected' = 'pending';
          const event = Object.freeze({
            accept(): boolean {
              if (decision !== 'pending' || closed) return false;
              decision = 'accepted';
              lastKnownGood = snapshot;
              return true;
            },
            diff: previous.diff(snapshot),
            previous,
            reject(): boolean {
              if (decision !== 'pending') return false;
              decision = 'rejected';
              return true;
            },
            snapshot,
            triggers: input.triggers,
            type: 'snapshot' as const,
          });
          yield event;
          decision = 'rejected';
        } catch (error) {
          if (isStopped()) return;
          yield Object.freeze({
            error: safeError(error, 'reload'),
            previous: lastKnownGood,
            stage: 'reload',
            triggers: input.triggers,
            type: 'error',
          });
        }
      }
    } finally {
      await close();
    }
  };

  return Object.freeze({
    close,
    get lastKnownGood(): ConfigSnapshot<unknown> {
      return lastKnownGood;
    },
    [Symbol.asyncIterator](): AsyncIterator<SnapshotWatchEvent<unknown>> {
      if (consumed)
        throw new Error('A snapshot watcher can be consumed only once');
      consumed = true;
      return events();
    },
  });
}
