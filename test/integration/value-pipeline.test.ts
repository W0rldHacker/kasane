import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  KasaneLayerError,
  KasaneMergeError,
  KasaneSourceError,
  kasane,
  remove,
  value,
} from '../../src/index.js';
import type {
  LayerDescriptor,
  LayerSource,
  SourceContext,
} from '../../src/index.js';

function custom(name: string, source: LayerSource): LayerDescriptor {
  return { name, source };
}

describe('value pipeline', () => {
  it('uses declaration order as the only precedence mechanism', async () => {
    const defaults = value('defaults', {
      feature: { enabled: false, mode: 'safe' },
      retries: 1,
    });
    const runtime = value('runtime', {
      feature: { enabled: true },
      retries: 5,
    });

    const forward = await kasane({ layers: [defaults, runtime] });
    const reverse = await kasane({ layers: [runtime, defaults] });

    expect(forward.value).toEqual({
      feature: { enabled: true, mode: 'safe' },
      retries: 5,
    });
    expect(reverse.value).toEqual({
      feature: { enabled: false, mode: 'safe' },
      retries: 1,
    });
  });

  it('loads async custom sources strictly sequentially', async () => {
    const events: string[] = [];
    const first: LayerSource = {
      kind: 'custom',
      async load() {
        events.push('first:start');
        await Promise.resolve();
        events.push('first:end');
        return { first: true };
      },
    };
    const second: LayerSource = {
      kind: 'custom',
      load() {
        events.push('second:start');
        return { second: true };
      },
    };

    const snapshot = await kasane({
      layers: [custom('first', first), custom('second', second)],
    });

    expect(events).toEqual(['first:start', 'first:end', 'second:start']);
    expect(snapshot.value).toEqual({ first: true, second: true });
  });

  it('detects duplicate names and invalid later descriptors before any load', async () => {
    const load = vi.fn(() => ({ loaded: true }));
    const source: LayerSource = { kind: 'custom', load };

    await expect(
      kasane({
        layers: [custom('duplicate', source), custom('duplicate', source)],
      }),
    ).rejects.toMatchObject({
      code: 'KASANE_LAYER_ERROR',
      details: { kind: 'duplicate-layer-name' },
    });
    expect(load).not.toHaveBeenCalled();

    await expect(
      kasane({
        layers: [custom('valid', source), { name: ' invalid ', source }],
      }),
    ).rejects.toBeInstanceOf(KasaneLayerError);
    expect(load).not.toHaveBeenCalled();
  });

  it('validates disabled declarations but never loads or merges them', async () => {
    const disabledLoad = vi.fn(() => ({ answer: 0 }));
    const snapshot = await kasane({
      layers: [
        {
          enabled: false,
          name: 'disabled',
          source: { kind: 'custom', load: disabledLoad },
        },
        value('enabled', { answer: 42 }),
      ],
    });

    expect(disabledLoad).not.toHaveBeenCalled();
    expect(snapshot.value).toEqual({ answer: 42 });
  });

  it('wraps rejected sources safely and does not start a later layer', async () => {
    const canary = 'source-error-canary';
    const laterLoad = vi.fn(() => ({ later: true }));
    const failing: LayerSource = {
      kind: 'remote',
      load() {
        throw new Error(canary);
      },
    };

    let failure: unknown;
    try {
      await kasane({
        layers: [
          custom('failing', failing),
          custom('later', { kind: 'custom', load: laterLoad }),
        ],
      });
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(KasaneSourceError);
    expect(failure).toMatchObject({
      code: 'KASANE_SOURCE_ERROR',
      details: { kind: 'remote', layerName: 'failing' },
    });
    expect(JSON.stringify(failure)).not.toContain(canary);
    expect(laterLoad).not.toHaveBeenCalled();
  });

  it('checks abort before and after load and returns no partial snapshot', async () => {
    const preAborted = new AbortController();
    preAborted.abort('unsafe-reason');
    const neverLoad = vi.fn(() => ({ value: true }));

    await expect(
      kasane({
        layers: [custom('never', { kind: 'custom', load: neverLoad })],
        signal: preAborted.signal,
      }),
    ).rejects.toMatchObject({
      code: 'KASANE_SOURCE_ERROR',
      details: { kind: 'aborted' },
    });
    expect(neverLoad).not.toHaveBeenCalled();

    const controller = new AbortController();
    const laterLoad = vi.fn(() => ({ later: true }));
    await expect(
      kasane({
        layers: [
          custom('aborting', {
            kind: 'custom',
            load(context) {
              expect(context.signal).toBe(controller.signal);
              controller.abort();
              return { partial: true };
            },
          }),
          custom('later', { kind: 'custom', load: laterLoad }),
        ],
        signal: controller.signal,
      }),
    ).rejects.toBeInstanceOf(KasaneSourceError);
    expect(laterLoad).not.toHaveBeenCalled();
  });

  it('treats undefined as a no-op but rejects a final absent root', async () => {
    await expect(
      kasane({ layers: [value('empty', undefined)] }),
    ).rejects.toMatchObject({
      code: 'KASANE_MERGE_ERROR',
      details: { kind: 'absent-root' },
    });

    const snapshot = await kasane({
      layers: [value('present', { answer: 42 }), value('no-op', undefined)],
    });
    expect(snapshot.value).toEqual({ answer: 42 });

    await expect(
      kasane({
        layers: [value('present', { answer: 42 }), value('remove', remove)],
      }),
    ).rejects.toBeInstanceOf(KasaneMergeError);
  });

  it('passes only one frozen cwd/signal context and never previous config', async () => {
    const contexts: SourceContext[] = [];
    const inspectContext: LayerSource = {
      kind: 'custom',
      load(context) {
        contexts.push(context);
        expect(Reflect.ownKeys(context)).toEqual(['cwd']);
        expect(Object.isFrozen(context)).toBe(true);
        expect('value' in context).toBe(false);
        expect('previous' in context).toBe(false);
        expect('snapshot' in context).toBe(false);
        return { observed: contexts.length };
      },
    };
    const configuredCwd = path.resolve('fixtures', 'cwd');

    await kasane({
      cwd: configuredCwd,
      layers: [
        custom('first', inspectContext),
        custom('second', inspectContext),
      ],
    });

    expect(contexts).toHaveLength(2);
    expect(contexts[0]).toBe(contexts[1]);
    expect(contexts[0]?.cwd).toBe(configuredCwd);
  });

  it('normalizes and detaches every source result before merge', async () => {
    const input = { nested: { count: -0 } };
    const snapshot = await kasane({ layers: [value('memory', input)] });

    expect(snapshot.value).not.toBe(input);
    expect(snapshot.value).toEqual({ nested: { count: 0 } });
    expect(Object.is(snapshot.get('nested.count'), -0)).toBe(false);

    const laterLoad = vi.fn(() => ({ later: true }));
    await expect(
      kasane({
        layers: [
          custom('unsafe', { kind: 'custom', load: () => new Date() }),
          custom('later', { kind: 'custom', load: laterLoad }),
        ],
      }),
    ).rejects.toBeInstanceOf(KasaneMergeError);
    expect(laterLoad).not.toHaveBeenCalled();
  });

  it('supports public merge rules, provenance mode, and freeze options', async () => {
    const snapshot = await kasane({
      freeze: false,
      layers: [
        value('defaults', { plugins: ['base'] }),
        value('runtime', { plugins: ['runtime'] }),
      ],
      merge: { plugins: 'append' },
      provenance: 'full',
    });

    expect(snapshot.value).toEqual({ plugins: ['base', 'runtime'] });
    expect(Object.isFrozen(snapshot.value)).toBe(false);
  });

  it('keeps the value adapter synchronous and leaves its input untouched', () => {
    const input = { answer: 42 };
    const descriptor = value('memory', input);
    const loaded = descriptor.source.load({ cwd: path.resolve('.') });

    expect(loaded).toBe(input);
    expect(loaded).not.toBeInstanceOf(Promise);
    expect(input).toEqual({ answer: 42 });
    expect(Object.isFrozen(input)).toBe(false);
  });
});
