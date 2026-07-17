import { describe, expect, it } from 'vitest';

import { env, kasane, secret } from '../../src/index.js';
import type { KasaneEvent } from '../../src/index.js';

const CANARY = 'OBS001_SECRET_VALUE_CANARY';
const REFERENCE_CANARY = 'OBS001_SECRET_REFERENCE_CANARY';

describe('lifecycle event security', () => {
  it('never publishes values, environment contents, or secret references', async () => {
    const events: KasaneEvent[] = [];

    await kasane({
      layers: [
        env('environment', {
          map: {
            [REFERENCE_CANARY]: { path: 'credentials.fromEnv' },
          },
          secret: true,
          source: { [REFERENCE_CANARY]: CANARY },
        }),
        secret('vault', {
          credentials: { token: CANARY },
        }),
      ],
      onEvent: (event) => events.push(event),
    });

    const serialized = JSON.stringify(events);
    expect(serialized).not.toContain(CANARY);
    expect(serialized).not.toContain(REFERENCE_CANARY);
    expect(events).toContainEqual(
      expect.objectContaining({
        kind: 'secret',
        layer: 'vault',
        success: true,
        type: 'source:end',
      }),
    );

    for (const event of events) {
      expect(Reflect.ownKeys(event).sort()).toEqual(
        event.type.endsWith(':start')
          ? ['kind', 'layer', 'type']
          : event.type === 'snapshot:created'
            ? ['durationMs', 'nodes', 'success', 'type']
            : ['durationMs', 'kind', 'layer', 'nodes', 'success', 'type'],
      );
    }
  });

  it('does not expose a global publication surface', () => {
    expect(Reflect.ownKeys(globalThis)).not.toContain('kasaneEvents');
    expect(Reflect.ownKeys(process)).not.toContain('kasaneEvents');
  });
});
