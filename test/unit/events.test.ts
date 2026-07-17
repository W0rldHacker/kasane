import { describe, expect, it, vi } from 'vitest';

import { KasaneSourceError, kasane, value } from '../../src/index.js';
import type {
  KasaneEvent,
  LayerDescriptor,
  LayerSource,
} from '../../src/index.js';

function custom(name: string, source: LayerSource): LayerDescriptor {
  return { name, source };
}

function comparable(event: KasaneEvent): Record<string, unknown> {
  const stable: Record<string, unknown> = { ...event };
  delete stable['durationMs'];
  return stable;
}

describe('lifecycle events', () => {
  it('publishes successful stages in strict pipeline order with node counts', async () => {
    const events: KasaneEvent[] = [];
    const snapshot = await kasane({
      layers: [
        value('defaults', { nested: { first: true } }),
        value('runtime', { nested: { second: true } }),
      ],
      onEvent: (event) => events.push(event),
      validate(input) {
        return { ...(input as object), validated: true };
      },
    });

    expect(snapshot.value).toEqual({
      nested: { first: true, second: true },
      validated: true,
    });
    expect(events.map((event) => event.type)).toEqual([
      'source:start',
      'source:end',
      'merge:start',
      'merge:end',
      'source:start',
      'source:end',
      'merge:start',
      'merge:end',
      'validation:start',
      'validation:end',
      'snapshot:created',
    ]);
    expect(events.map(comparable)).toEqual([
      { kind: 'value', layer: 'defaults', type: 'source:start' },
      {
        kind: 'value',
        layer: 'defaults',
        nodes: 3,
        success: true,
        type: 'source:end',
      },
      { kind: 'value', layer: 'defaults', type: 'merge:start' },
      {
        kind: 'value',
        layer: 'defaults',
        nodes: 3,
        success: true,
        type: 'merge:end',
      },
      { kind: 'value', layer: 'runtime', type: 'source:start' },
      {
        kind: 'value',
        layer: 'runtime',
        nodes: 3,
        success: true,
        type: 'source:end',
      },
      { kind: 'value', layer: 'runtime', type: 'merge:start' },
      {
        kind: 'value',
        layer: 'runtime',
        nodes: 4,
        success: true,
        type: 'merge:end',
      },
      { kind: 'validation', layer: 'validation', type: 'validation:start' },
      {
        kind: 'validation',
        layer: 'validation',
        nodes: 5,
        success: true,
        type: 'validation:end',
      },
      { nodes: 5, success: true, type: 'snapshot:created' },
    ]);

    for (const event of events) {
      expect(Object.isFrozen(event)).toBe(true);
      if ('durationMs' in event) {
        expect(event.durationMs).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('publishes a failed source end and preserves the source error', async () => {
    const events: KasaneEvent[] = [];
    const laterLoad = vi.fn(() => ({ later: true }));

    await expect(
      kasane({
        layers: [
          custom('remote', {
            kind: 'custom',
            load() {
              throw new Error('untrusted source failure');
            },
          }),
          custom('later', { kind: 'custom', load: laterLoad }),
        ],
        onEvent: (event) => events.push(event),
      }),
    ).rejects.toBeInstanceOf(KasaneSourceError);

    expect(events.map(comparable)).toEqual([
      { kind: 'custom', layer: 'remote', type: 'source:start' },
      {
        kind: 'custom',
        layer: 'remote',
        nodes: 0,
        success: false,
        type: 'source:end',
      },
    ]);
    expect(laterLoad).not.toHaveBeenCalled();
  });

  it('publishes a failed validation end without a snapshot event', async () => {
    const events: KasaneEvent[] = [];

    await expect(
      kasane({
        layers: [value('input', { valid: false })],
        onEvent: (event) => events.push(event),
        validate() {
          throw new Error('validation failed');
        },
      }),
    ).rejects.toMatchObject({ code: 'KASANE_VALIDATION_ERROR' });

    expect(events.slice(-2).map(comparable)).toEqual([
      { kind: 'validation', layer: 'validation', type: 'validation:start' },
      {
        kind: 'validation',
        layer: 'validation',
        nodes: 0,
        success: false,
        type: 'validation:end',
      },
    ]);
    expect(events).not.toContainEqual(
      expect.objectContaining({ type: 'snapshot:created' }),
    );
  });

  it('isolates synchronous and asynchronous callback failures', async () => {
    const syncSnapshot = await kasane({
      layers: [value('input', { answer: 42 })],
      onEvent() {
        throw new Error('observer failure');
      },
    });
    expect(syncSnapshot.value).toEqual({ answer: 42 });

    const asyncSnapshot = await kasane({
      layers: [value('input', { answer: 42 })],
      async onEvent() {
        await Promise.resolve();
        throw new Error('async observer failure');
      },
    });
    expect(asyncSnapshot.value).toEqual({ answer: 42 });

    await expect(
      kasane({
        layers: [
          custom('failed', {
            kind: 'custom',
            load() {
              throw new Error('source failure');
            },
          }),
        ],
        onEvent() {
          throw new Error('observer failure');
        },
      }),
    ).rejects.toBeInstanceOf(KasaneSourceError);
  });

  it('does not publish events for disabled layers', async () => {
    const events: KasaneEvent[] = [];
    const disabledLoad = vi.fn(() => ({ hidden: true }));

    await kasane({
      layers: [
        custom('disabled', {
          kind: 'custom',
          load: disabledLoad,
        }),
        value('enabled', { visible: true }),
      ].map((layer, index) =>
        index === 0 ? { ...layer, enabled: false } : layer,
      ),
      onEvent: (event) => events.push(event),
    });

    expect(disabledLoad).not.toHaveBeenCalled();
    expect(events).not.toContainEqual(
      expect.objectContaining({ layer: 'disabled' }),
    );
  });
});
