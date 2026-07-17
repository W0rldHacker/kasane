import { describe, expect, it } from 'vitest';

import { env, kasane, remove, secret, value } from '../../src/index.js';

describe('snapshot origin and explanation', () => {
  it('resolves immutable leaf and structural origins and marks mixed containers', async () => {
    const snapshot = await kasane({
      layers: [
        value('defaults', {
          server: { host: '127.0.0.1', port: 3000 },
        }),
        value('runtime', { server: { port: 8080 } }),
      ],
      provenance: 'full',
    });

    const leaf = snapshot.origin('server.port');
    expect(leaf).toMatchObject({
      layer: { kind: 'value', name: 'runtime' },
      operation: 'replace',
      scope: 'leaf',
    });
    expect(Object.isFrozen(leaf)).toBe(true);
    expect(Object.isFrozen(leaf?.layer)).toBe(true);

    const containerOrigin = snapshot.origin('server');
    expect(containerOrigin).toMatchObject({
      layer: { name: 'runtime' },
      operation: 'merge',
      scope: 'container',
    });
    const explanation = snapshot.explain('server');
    expect(explanation).toMatchObject({
      found: true,
      mixed: true,
      origin: { layer: { name: 'runtime' }, operation: 'merge' },
      path: 'server',
      value: { host: '127.0.0.1', port: 8080 },
    });
    expect(Object.isFrozen(explanation)).toBe(true);
    expect(explanation.format()).toBe(explanation.format());
  });

  it('exposes history only in full mode and preserves actual layer order', async () => {
    const layers = [
      value('defaults', { retries: 3 }),
      value('deployment', { retries: 4 }),
      value('runtime', { retries: 5 }),
    ];
    const [full, originOnly, none] = await Promise.all([
      kasane({ layers, provenance: 'full' }),
      kasane({ layers, provenance: 'origin-only' }),
      kasane({ layers, provenance: 'none' }),
    ]);

    const fullExplanation = full.explain('retries');
    expect(fullExplanation.found).toBe(true);
    if (!fullExplanation.found) throw new Error('Expected found explanation');
    expect(
      fullExplanation.history?.map((entry) => entry.origin.layer.name),
    ).toEqual(['defaults', 'deployment', 'runtime']);
    expect(
      fullExplanation.history
        ?.filter((entry) => entry.kind === 'value')
        .map((entry) => entry.value),
    ).toEqual([3, 4, 5]);

    expect(originOnly.origin('retries')?.layer.name).toBe('runtime');
    expect('history' in originOnly.explain('retries')).toBe(false);
    expect(none.origin('retries')).toBeUndefined();
    const noneExplanation = none.explain('retries');
    expect(noneExplanation).toMatchObject({
      found: true,
      path: 'retries',
      value: 5,
    });
    expect('origin' in noneExplanation).toBe(false);
    expect('history' in noneExplanation).toBe(false);
  });

  it('distinguishes removed and never-observed paths without throwing', async () => {
    const snapshot = await kasane({
      layers: [
        value('defaults', {
          obsolete: 'old',
          server: { host: 'localhost' },
        }),
        value('cleanup', { obsolete: remove }),
      ],
      provenance: 'full',
    });

    expect(snapshot.origin('obsolete')).toBeUndefined();
    const removed = snapshot.explain('obsolete.child');
    expect(removed).toMatchObject({
      found: false,
      nearest: 'obsolete',
      path: 'obsolete.child',
      removal: {
        layer: { name: 'cleanup' },
        operation: 'remove',
        scope: 'tombstone',
      },
    });
    expect(removed.history?.map((entry) => entry.origin.layer.name)).toEqual([
      'defaults',
      'cleanup',
    ]);

    expect(snapshot.explain('server.tls.cert')).toEqual(
      expect.objectContaining({
        found: false,
        nearest: 'server',
        path: 'server.tls.cert',
      }),
    );
    expect(snapshot.explain('server.tls.cert')).not.toHaveProperty('removal');
  });

  it('resolves environment input references', async () => {
    const snapshot = await kasane({
      layers: [
        env('environment', {
          prefix: 'APP_',
          source: { APP_SERVER__PORT: '8080' },
        }),
      ],
    });

    expect(snapshot.origin('server.port')).toMatchObject({
      inputReference: 'APP_SERVER__PORT',
      layer: { kind: 'env', name: 'environment' },
    });
  });

  it('supports array paths and reports append as the container touch', async () => {
    const snapshot = await kasane({
      layers: [
        value('defaults', { items: ['first'] }),
        value('runtime', { items: ['second'] }),
      ],
      merge: { items: 'append' },
      provenance: 'full',
    });

    expect(snapshot.origin('items.0')?.layer.name).toBe('defaults');
    expect(snapshot.origin('items.1')?.layer.name).toBe('runtime');
    expect(snapshot.origin('items')?.operation).toBe('append');
    expect(snapshot.explain('items')).toMatchObject({
      found: true,
      mixed: true,
      value: ['first', 'second'],
    });
  });

  it('redacts secret current values and full history structurally', async () => {
    const snapshot = await kasane({
      layers: [
        value('defaults', { token: 'old-public-value' }),
        secret('vault', { token: 'SECRET_EXPLAIN_CANARY' }),
      ],
      provenance: 'full',
    });
    const explanation = snapshot.explain('token');

    expect(explanation).toMatchObject({
      found: true,
      origin: { layer: { name: 'vault' }, secret: true },
      secret: true,
      value: '[REDACTED]',
    });
    if (!explanation.found) throw new Error('Expected found explanation');
    expect(explanation.history?.map((entry) => entry.kind)).toEqual([
      'redacted',
      'redacted',
    ]);
    expect(JSON.stringify(explanation)).not.toContain('SECRET_EXPLAIN_CANARY');
    expect(explanation.format()).not.toContain('SECRET_EXPLAIN_CANARY');
  });
});
