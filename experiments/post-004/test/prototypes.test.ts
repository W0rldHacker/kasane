import diagnosticsChannel from 'node:diagnostics_channel';
import { performance } from 'node:perf_hooks';

import { ConfigSnapshot, kasane, value } from '@worldhacker/kasane';
import type { KasaneEvent } from '@worldhacker/kasane';
import { describe, expect, it, vi } from 'vitest';

import {
  composeEventAdapters,
  createDiagnosticsChannelBridge,
  createOtelEventAdapter,
  MAX_ACTIVE_PROTOTYPE_SPANS,
} from '../src/telemetry.js';
import type {
  PrototypeSpan,
  PrototypeTracer,
  TelemetryAttribute,
} from '../src/telemetry.js';
import {
  operationToStableStrategy,
  parseMergeOperation,
} from '../src/merge-operation.js';
import { pollRemote } from '../src/polling.js';
import { typedPaths } from '../src/typed-paths.js';

const SECRET_CANARY = 'POST_004_TELEMETRY_SECRET_CANARY';

describe('POST-004 removable prototypes', () => {
  it('delegates depth-limited typed paths to the public snapshot contract', () => {
    const snapshot = new ConfigSnapshot({
      server: { endpoints: [{ host: 'localhost', port: 3000 }] },
    });
    const reader = typedPaths(snapshot, { depth: 5 });
    const port: number = reader.require('server.endpoints.0.port');
    expect(port).toBe(3000);
    expect(reader.get('server.endpoints.0.host')).toBe('localhost');
    expect(() => typedPaths(snapshot, { depth: 7 as 6 })).toThrow(/depth/u);
  });

  it('allowlists telemetry fields and keeps hostile secret extras out', async () => {
    const spans: Record<string, TelemetryAttribute>[] = [];
    const span: PrototypeSpan = {
      end: vi.fn(),
      setAttribute(name, attribute): void {
        const current = spans.at(-1);
        if (current === undefined) throw new Error('Expected an active span');
        current[name] = attribute;
      },
    };
    const tracer: PrototypeTracer = {
      startSpan(_name, options): PrototypeSpan {
        spans.push({ ...options.attributes });
        return span;
      },
    };
    const otel = createOtelEventAdapter(tracer);
    const channelName = `kasane.post-004.${String(Date.now())}`;
    const published: unknown[] = [];
    const subscriber = (message: unknown): void => {
      published.push(message);
    };
    diagnosticsChannel.subscribe(channelName, subscriber);
    try {
      const bridge = createDiagnosticsChannelBridge(channelName);
      const combined = composeEventAdapters([otel, bridge]);
      const hostile = Object.freeze({
        durationMs: 2,
        nodes: 3,
        secret: SECRET_CANARY,
        success: true,
        type: 'snapshot:created',
        value: SECRET_CANARY,
      }) as unknown as KasaneEvent;
      combined(hostile);
      await Promise.resolve();
      expect(JSON.stringify({ published, spans })).not.toContain(SECRET_CANARY);
      expect(spans).toMatchObject([
        {
          'kasane.duration_ms': 2,
          'kasane.event': 'snapshot:created',
          'kasane.nodes': 3,
          'kasane.success': true,
        },
      ]);
      expect(published).toEqual([
        {
          durationMs: 2,
          nodes: 3,
          success: true,
          type: 'snapshot:created',
        },
      ]);
    } finally {
      diagnosticsChannel.unsubscribe(channelName, subscriber);
    }
  });

  it('isolates telemetry failures and rejects unlimited fanout', async () => {
    const snapshot = await kasane({
      layers: [value('safe-layer', { ready: true })],
      onEvent: composeEventAdapters([
        () => {
          throw new Error(SECRET_CANARY);
        },
        async () => Promise.reject(new Error(SECRET_CANARY)),
      ]),
    });
    expect(snapshot.require('ready')).toBe(true);
    expect(() =>
      composeEventAdapters(new Array(5).fill(() => undefined)),
    ).toThrow(/1 through 4/u);
  });

  it('bounds incomplete telemetry span state', () => {
    let starts = 0;
    const tracer: PrototypeTracer = {
      startSpan(): PrototypeSpan {
        starts += 1;
        return { end: vi.fn(), setAttribute: vi.fn() };
      },
    };
    const adapter = createOtelEventAdapter(tracer);
    for (let index = 0; index < MAX_ACTIVE_PROTOTYPE_SPANS + 20; index += 1) {
      adapter({
        kind: 'value',
        layer: `layer-${String(index)}`,
        type: 'source:start',
      });
    }
    expect(starts).toBe(MAX_ACTIVE_PROTOTYPE_SPANS);
  });

  it('cancels remote polling promptly with no overlapping work', async () => {
    const controller = new AbortController();
    let probes = 0;
    let active = 0;
    let maximumActive = 0;
    const adapter = pollRemote({
      intervalMs: 1_000,
      probe: async () => {
        probes += 1;
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        await Promise.resolve();
        active -= 1;
        return false;
      },
      signal: controller.signal,
    });
    const iterator = adapter[Symbol.asyncIterator]();
    const pending = iterator.next();
    while (probes === 0) await new Promise((resolve) => setImmediate(resolve));
    const started = performance.now();
    controller.abort();
    await expect(pending).resolves.toEqual({ done: true, value: undefined });
    expect(performance.now() - started).toBeLessThan(100);
    expect(maximumActive).toBe(1);
  });

  it('emits only value-free polling triggers', async () => {
    const adapter = pollRemote({
      adapter: 'fixture-provider',
      intervalMs: 10,
      maxPolls: 1,
      probe: () => true,
    });
    const iterator = adapter[Symbol.asyncIterator]();
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: { adapter: 'fixture-provider', kind: 'provider' },
    });
    await expect(iterator.next()).resolves.toEqual({
      done: true,
      value: undefined,
    });
  });

  it('rejects non-deterministic merge callbacks without invoking accessors', () => {
    const callback = vi.fn(() => Math.random());
    expect(() =>
      parseMergeOperation({ apply: callback, kind: 'replace' }),
    ).toThrow(/invalid/u);
    expect(callback).not.toHaveBeenCalled();

    const getter = vi.fn(() => callback);
    const hostile = Object.defineProperty({ kind: 'replace' }, 'apply', {
      enumerable: true,
      get: getter,
    });
    expect(() => parseMergeOperation(hostile)).toThrow(/invalid/u);
    expect(getter).not.toHaveBeenCalled();
  });

  it('parses only closed serializable operations mapped to stable strategies', () => {
    const operation = parseMergeOperation({
      direction: 'prepend',
      kind: 'array-concat',
      maxItems: 100,
    });
    expect(operation).toEqual({
      direction: 'prepend',
      kind: 'array-concat',
      maxItems: 100,
    });
    expect(operationToStableStrategy(operation)).toBe('prepend');
    expect(() =>
      parseMergeOperation({ kind: 'array-concat', maxItems: Infinity }),
    ).toThrow(/invalid/u);
  });
});
