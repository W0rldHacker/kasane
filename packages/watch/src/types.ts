import type {
  ConfigDiff,
  ConfigSnapshot,
  InferValidationOutput,
  KasaneOptions,
  ValidationAdapter,
} from '@worldhacker/kasane';

export type WatchTriggerKind = 'file' | 'provider';

/** Value-free reason to attempt one reload. */
export interface WatchTrigger {
  readonly adapter: string;
  readonly kind: WatchTriggerKind;
}

export interface WatchAdapter extends AsyncIterable<WatchTrigger> {
  readonly close: () => void | Promise<void>;
}

export interface WatchReloadContext<T> {
  readonly previous: ConfigSnapshot<T>;
  readonly signal: AbortSignal;
  readonly triggers: readonly WatchTrigger[];
}

interface SnapshotWatchBaseOptions<T> {
  readonly adapters: readonly WatchAdapter[];
  readonly debounceMs?: number;
  readonly initial: ConfigSnapshot<T>;
  readonly signal?: AbortSignal;
}

export interface SnapshotWatchOptions<
  T = unknown,
> extends SnapshotWatchBaseOptions<T> {
  readonly build: (
    context: WatchReloadContext<T>,
  ) => KasaneOptions<undefined> | Promise<KasaneOptions<undefined>>;
}

export interface ValidatedSnapshotWatchOptions<
  Validation extends ValidationAdapter,
> extends SnapshotWatchBaseOptions<InferValidationOutput<Validation>> {
  readonly build: (
    context: WatchReloadContext<InferValidationOutput<Validation>>,
  ) =>
    | (KasaneOptions<Validation> & Readonly<{ validate: Validation }>)
    | Promise<KasaneOptions<Validation> & Readonly<{ validate: Validation }>>;
}

export interface WatchError {
  readonly code?: string;
  readonly message: string;
  readonly name: string;
}

export interface WatchErrorEvent<T> {
  readonly error: WatchError;
  readonly previous: ConfigSnapshot<T>;
  readonly stage: 'adapter' | 'reload';
  readonly triggers: readonly WatchTrigger[];
  readonly type: 'error';
}

export interface WatchSnapshotEvent<T> {
  /** Accepts this candidate as the base for later reloads. */
  readonly accept: () => boolean;
  readonly diff: ConfigDiff;
  readonly previous: ConfigSnapshot<T>;
  /** Explicitly keeps the previous last-known-good snapshot. */
  readonly reject: () => boolean;
  readonly snapshot: ConfigSnapshot<T>;
  readonly triggers: readonly WatchTrigger[];
  readonly type: 'snapshot';
}

export type SnapshotWatchEvent<T> = WatchErrorEvent<T> | WatchSnapshotEvent<T>;

export interface SnapshotWatcher<T> extends AsyncIterable<
  SnapshotWatchEvent<T>
> {
  readonly close: () => Promise<void>;
  readonly lastKnownGood: ConfigSnapshot<T>;
}
