import { performance } from 'node:perf_hooks';

export type KasaneEventType =
  | 'source:start'
  | 'source:end'
  | 'merge:start'
  | 'merge:end'
  | 'validation:start'
  | 'validation:end'
  | 'snapshot:created';

export interface LayerEventIdentity {
  /** Invocation-local layer name. */
  readonly layer: string;
  /** Provider-neutral source kind, or `validation` for validation events. */
  readonly kind: string;
}

export interface SourceStartEvent extends LayerEventIdentity {
  readonly type: 'source:start';
}

export interface MergeStartEvent extends LayerEventIdentity {
  readonly type: 'merge:start';
}

export interface ValidationStartEvent extends LayerEventIdentity {
  readonly type: 'validation:start';
}

export interface CompletedEventMetrics {
  /** Monotonic elapsed time. Never use this value as snapshot identity. */
  readonly durationMs: number;
  /** Canonical nodes produced by the stage; zero when none were produced. */
  readonly nodes: number;
  readonly success: boolean;
}

export interface SourceEndEvent
  extends LayerEventIdentity, CompletedEventMetrics {
  readonly type: 'source:end';
}

export interface MergeEndEvent
  extends LayerEventIdentity, CompletedEventMetrics {
  readonly type: 'merge:end';
}

export interface ValidationEndEvent
  extends LayerEventIdentity, CompletedEventMetrics {
  readonly type: 'validation:end';
}

export interface SnapshotCreatedEvent extends CompletedEventMetrics {
  readonly type: 'snapshot:created';
}

/** Safe, value-free lifecycle data published only to an invocation callback. */
export type KasaneEvent =
  | SourceStartEvent
  | SourceEndEvent
  | MergeStartEvent
  | MergeEndEvent
  | ValidationStartEvent
  | ValidationEndEvent
  | SnapshotCreatedEvent;

export type KasaneEventCallback = (event: KasaneEvent) => unknown;

/** Invocation-local emitter. Callback failures never cross this boundary. */
export function createEventEmitter(
  callback: KasaneEventCallback | undefined,
): (event: KasaneEvent) => void {
  if (callback === undefined) return () => undefined;

  return (event): void => {
    try {
      const result = callback(Object.freeze(event));
      void Promise.resolve(result).catch(() => undefined);
    } catch {
      // Observability must not affect configuration control flow.
    }
  };
}

export function eventTimer(): () => number {
  const startedAt = performance.now();
  return () => Math.max(0, performance.now() - startedAt);
}

/** Counts an already-normalized tree without retaining or publishing values. */
export function countConfigNodes(value: unknown): number {
  if (value === undefined) return 0;

  let nodes = 0;
  const work: unknown[] = [value];
  while (work.length > 0) {
    const current = work.pop();
    if (current === undefined) continue;
    nodes += 1;

    if (typeof current !== 'object' || current === null) continue;
    if (Array.isArray(current)) {
      for (const child of current) work.push(child);
      continue;
    }
    for (const child of Object.values(current)) work.push(child);
  }
  return nodes;
}
