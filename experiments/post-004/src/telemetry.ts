import diagnosticsChannel from 'node:diagnostics_channel';

import type { KasaneEvent, KasaneEventCallback } from '@worldhacker/kasane';

export type TelemetryAttribute = boolean | number | string;
export type TelemetryAttributes = Readonly<Record<string, TelemetryAttribute>>;

export interface PrototypeSpan {
  readonly end: () => void;
  readonly setAttribute: (name: string, value: TelemetryAttribute) => void;
}

export interface PrototypeTracer {
  readonly startSpan: (
    name: string,
    options: Readonly<{ attributes: TelemetryAttributes }>,
  ) => PrototypeSpan;
}

export const MAX_ACTIVE_PROTOTYPE_SPANS = 256;

type SafeLifecycleRecord = Readonly<{
  durationMs?: number;
  kind?: string;
  layer?: string;
  nodes?: number;
  success?: boolean;
  type: KasaneEvent['type'];
}>;

/** Copies an explicit value-free allowlist and discards hostile extra fields. */
export function safeLifecycleRecord(event: KasaneEvent): SafeLifecycleRecord {
  const record: {
    durationMs?: number;
    kind?: string;
    layer?: string;
    nodes?: number;
    success?: boolean;
    type: KasaneEvent['type'];
  } = { type: event.type };
  if (event.type !== 'snapshot:created') {
    record.kind = event.kind;
    record.layer = event.layer;
  }
  if ('durationMs' in event) {
    record.durationMs = event.durationMs;
    record.nodes = event.nodes;
    record.success = event.success;
  }
  return Object.freeze(record);
}

function attributes(record: SafeLifecycleRecord): TelemetryAttributes {
  return Object.freeze({
    'kasane.event': record.type,
    ...(record.kind === undefined ? {} : { 'kasane.kind': record.kind }),
    ...(record.layer === undefined ? {} : { 'kasane.layer': record.layer }),
  });
}

function stage(type: KasaneEvent['type']): string {
  const [result] = type.split(':');
  return result ?? '';
}

function activeKey(record: SafeLifecycleRecord): string {
  return `${stage(record.type)}\u0000${record.kind ?? ''}\u0000${record.layer ?? ''}`;
}

function setCompletion(span: PrototypeSpan, record: SafeLifecycleRecord): void {
  if (record.durationMs !== undefined) {
    span.setAttribute('kasane.duration_ms', record.durationMs);
  }
  if (record.nodes !== undefined)
    span.setAttribute('kasane.nodes', record.nodes);
  if (record.success !== undefined) {
    span.setAttribute('kasane.success', record.success);
  }
}

/** Dependency-free OTel-shaped mapper over the public lifecycle callback. */
export function createOtelEventAdapter(
  tracer: PrototypeTracer,
): KasaneEventCallback {
  const active = new Map<string, PrototypeSpan>();
  return (event): void => {
    try {
      const record = safeLifecycleRecord(event);
      const key = activeKey(record);
      if (event.type.endsWith(':start')) {
        if (active.has(key)) {
          const previous = active.get(key);
          active.delete(key);
          previous?.end();
        }
        if (active.size >= MAX_ACTIVE_PROTOTYPE_SPANS) return;
        const span = tracer.startSpan(`kasane.${stage(event.type)}`, {
          attributes: attributes(record),
        });
        active.set(key, span);
        return;
      }
      const span =
        active.get(key) ??
        tracer.startSpan(`kasane.${stage(event.type)}`, {
          attributes: attributes(record),
        });
      active.delete(key);
      setCompletion(span, record);
      span.end();
    } catch {
      // Experimental telemetry must remain observational.
    }
  };
}

export const DEFAULT_DIAGNOSTICS_CHANNEL = 'kasane.lifecycle.v1';

/** Explicit opt-in diagnostics_channel bridge; no global auto-registration. */
export function createDiagnosticsChannelBridge(
  name = DEFAULT_DIAGNOSTICS_CHANNEL,
): KasaneEventCallback {
  if (typeof name !== 'string' || name.length === 0 || name.length > 128) {
    throw new TypeError(
      'Diagnostics channel name must contain 1 to 128 characters',
    );
  }
  const channel = diagnosticsChannel.channel(name);
  return (event): void => {
    try {
      channel.publish(safeLifecycleRecord(event));
    } catch {
      // Subscriber failures cannot affect the configuration pipeline.
    }
  };
}

/** Bounded replacement for an unlimited observer/plugin registry. */
export function composeEventAdapters(
  adapters: readonly KasaneEventCallback[],
): KasaneEventCallback {
  if (adapters.length === 0 || adapters.length > 4) {
    throw new TypeError('Telemetry composition requires 1 through 4 adapters');
  }
  if (adapters.some((adapter) => typeof adapter !== 'function')) {
    throw new TypeError('Telemetry adapters must be functions');
  }
  const fixed = Object.freeze([...adapters]);
  return (event): void => {
    for (const adapter of fixed) {
      try {
        const result = adapter(event);
        void Promise.resolve(result).catch(() => undefined);
      } catch {
        // Adapters are isolated from each other and from Kasane.
      }
    }
  };
}
