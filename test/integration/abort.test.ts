import { describe, expect, it, vi } from 'vitest';

import { kasane } from '../../src/index.js';
import type { KasaneEvent, LayerDescriptor } from '../../src/index.js';

describe('abort hardening', () => {
  it('discards loaded data and never creates a partial snapshot', async () => {
    const controller = new AbortController();
    const events: KasaneEvent[] = [];
    const laterLoad = vi.fn(() => ({ later: true }));
    const layers: LayerDescriptor[] = [
      {
        name: 'aborting',
        source: {
          kind: 'custom',
          load() {
            controller.abort('untrusted abort reason');
            return { partial: true };
          },
        },
      },
      { name: 'later', source: { kind: 'custom', load: laterLoad } },
    ];

    await expect(
      kasane({
        layers,
        onEvent: (event) => events.push(event),
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({
      code: 'KASANE_SOURCE_ERROR',
      details: { kind: 'aborted', layerName: 'aborting' },
    });

    expect(laterLoad).not.toHaveBeenCalled();
    expect(events).not.toContainEqual(
      expect.objectContaining({ type: 'snapshot:created' }),
    );
    expect(JSON.stringify(events)).not.toContain('partial');
    expect(JSON.stringify(events)).not.toContain('untrusted abort reason');
  });
});
