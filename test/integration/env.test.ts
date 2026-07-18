import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { KasaneSourceError, env, kasane, value } from '../../src/index.js';
import {
  caseCollisionOrders,
  parentChildCollisionOrders,
  windowsCaseFixture,
} from '../fixtures/env-collisions.js';

function source(
  entries: readonly (readonly [string, string])[],
): Record<string, string> {
  return Object.fromEntries(entries);
}

async function sourceFailure(
  injected: Record<string, string>,
): Promise<KasaneSourceError> {
  try {
    await kasane({
      layers: [env('environment', { prefix: 'APP_', source: injected })],
    });
  } catch (error) {
    if (error instanceof KasaneSourceError) return error;
    throw error;
  }
  throw new Error('Expected environment mapping to fail');
}

describe('env source', () => {
  it('maps sorted prefix keys with lower-case segments and no coercion by default', async () => {
    const snapshot = await kasane({
      layers: [
        env('environment', {
          prefix: 'APP_',
          source: source([
            ['IGNORED', 'outside-prefix'],
            ['APP_SCIENTIFIC', '1e5'],
            ['APP_NULL', 'null'],
            ['APP_FALSE', 'false'],
            ['APP_EMPTY', ''],
            ['APP_CODE', '00123'],
            ['APP_SERVER__HOST', 'localhost'],
            ['APP_SERVER__PORT', '8080'],
          ]),
        }),
      ],
    });

    expect(snapshot.value).toEqual({
      code: '00123',
      empty: '',
      false: 'false',
      null: 'null',
      scientific: '1e5',
      server: { host: 'localhost', port: '8080' },
    });
    expect(snapshot.has('ignored')).toBe(false);
  });

  it('coerces only valid JSON and leaves invalid literals as their original strings', async () => {
    const snapshot = await kasane({
      layers: [
        env('environment', {
          coerce: 'json',
          prefix: 'APP_',
          source: {
            APP_CODE: '00123',
            APP_EMPTY: '',
            APP_FALSE: 'false',
            APP_INVALID_BOOLEAN: 'False',
            APP_NULL: 'null',
            APP_OBJECT: '{"enabled":true}',
            APP_SCIENTIFIC: '1e5',
          },
        }),
      ],
    });

    expect(snapshot.value).toEqual({
      code: '00123',
      empty: '',
      false: false,
      invalid_boolean: 'False',
      null: null,
      object: { enabled: true },
      scientific: 100_000,
    });
  });

  it('supports preserve-case and an explicit separator', async () => {
    const snapshot = await kasane({
      layers: [
        env('environment', {
          case: 'preserve',
          prefix: 'K_',
          separator: '::',
          source: { 'K_Server::HTTPPort': '443' },
        }),
      ],
    });

    expect(snapshot.value).toEqual({ Server: { HTTPPort: '443' } });
  });

  it('snapshots the injected source when its layer loads', async () => {
    const injected: Record<string, string> = { APP_FIRST: 'before' };
    const parse = vi.fn(async (input: string) => {
      injected['APP_SECOND'] = 'changed-during-parse';
      await Promise.resolve();
      return input;
    });

    const snapshot = await kasane({
      layers: [
        {
          name: 'mutator',
          source: {
            kind: 'custom',
            load() {
              injected['APP_FIRST'] = 'at-load';
              injected['APP_SECOND'] = 'snapshotted';
              return { ready: true };
            },
          },
        },
        env('environment', {
          map: {
            APP_FIRST: { parse, path: 'first' },
            APP_SECOND: 'second',
          },
          source: injected,
        }),
      ],
    });

    expect(snapshot.value).toEqual({
      first: 'at-load',
      ready: true,
      second: 'snapshotted',
    });
    expect(parse).toHaveBeenCalledOnce();
  });

  it('supports explicit mapping and sync or async parsers', async () => {
    const snapshot = await kasane({
      layers: [
        env('environment', {
          coerce: 'json',
          map: {
            APP_DEBUG: {
              parse: (input) => input === 'yes',
              path: 'features.debug',
            },
            APP_PORT: {
              parse: async (input) => {
                await Promise.resolve();
                return Number(input);
              },
              path: 'server.port',
            },
            APP_UNMAPPED: 'unused',
          },
          prefix: 'IGNORED_IN_EXPLICIT_MODE_',
          source: { APP_DEBUG: 'yes', APP_PORT: '8080', OTHER: 'ignored' },
        }),
      ],
    });

    expect(snapshot.value).toEqual({
      features: { debug: true },
      server: { port: 8080 },
    });
  });

  it('wraps explicit parser failures without exposing the value', async () => {
    const canary = 'ENV_VALUE_CANARY';
    let failure: unknown;
    try {
      await kasane({
        layers: [
          env('environment', {
            map: {
              APP_PORT: {
                parse() {
                  throw new Error(canary);
                },
                path: 'server.port',
              },
            },
            source: { APP_PORT: canary },
          }),
          value('later', { unreachable: true }),
        ],
      });
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(KasaneSourceError);
    expect(failure).toMatchObject({
      details: {
        kind: 'env-map-parse-error',
        operation: 'map-env',
        path: 'server.port',
        reference: 'APP_PORT',
      },
    });
    expect(JSON.stringify(failure)).not.toContain(canary);
  });

  it.each([
    ['leading', { APP___PORT: '1' }],
    ['middle', { APP_SERVER____PORT: '1' }],
    ['trailing', { APP_SERVER__: '1' }],
  ])('rejects an empty %s segment', async (_label, injected) => {
    await expect(sourceFailure(injected)).resolves.toMatchObject({
      details: { kind: 'empty-env-segment' },
    });
  });

  it('rejects dangerous segments before normalization', async () => {
    await expect(
      sourceFailure({ APP_SERVER__CONSTRUCTOR__NAME: 'unsafe' }),
    ).resolves.toMatchObject({
      details: {
        kind: 'dangerous-env-segment',
        reference: 'APP_SERVER__CONSTRUCTOR__NAME',
      },
    });
  });

  it('reports the same case collision for every enumeration order', async () => {
    const forward = await sourceFailure(source(caseCollisionOrders[0]));
    const reverse = await sourceFailure(source(caseCollisionOrders[1]));

    expect(forward.toJSON()).toEqual(reverse.toJSON());
    expect(forward.details.kind).toBe('env-case-collision');
  });

  it('reports the same parent/child collision for every enumeration order', async () => {
    const forward = await sourceFailure(source(parentChildCollisionOrders[0]));
    const reverse = await sourceFailure(source(parentChildCollisionOrders[1]));

    expect(forward.toJSON()).toEqual(reverse.toJSON());
    expect(forward.details.kind).toBe('env-parent-child-collision');
  });

  it('rejects duplicate targets in explicit maps', async () => {
    await expect(
      kasane({
        layers: [
          env('environment', {
            map: { FIRST: 'server.port', SECOND: 'server.port' },
            source: { FIRST: '1', SECOND: '2' },
          }),
        ],
      }),
    ).rejects.toMatchObject({
      code: 'KASANE_SOURCE_ERROR',
      details: { kind: 'duplicate-env-path', path: 'server.port' },
    });
  });

  it('uses an injected Windows-style fixture without platform-dependent selection', async () => {
    const windowsStyle = source(windowsCaseFixture);

    await expect(
      kasane({ layers: [env('windows', { source: windowsStyle })] }),
    ).rejects.toMatchObject({
      details: { kind: 'env-case-collision', path: 'path' },
    });

    const preserved = await kasane({
      layers: [env('windows', { case: 'preserve', source: windowsStyle })],
    });
    expect(preserved.value).toEqual({ PATH: 'upper-case', Path: 'mixed-case' });
  });

  it('publishes one safe variable reference for every mapped path', async () => {
    const snapshot = await kasane({
      cwd: path.resolve('.'),
      provenance: 'full',
      layers: [
        env('metadata', {
          coerce: 'json',
          prefix: 'APP_',
          source: {
            APP_FEATURE: '{"enabled":true}',
            APP_SERVER__PORT: '8080',
          },
        }),
      ],
    });
    const origins = [
      snapshot.origin('feature'),
      snapshot.origin('feature.enabled'),
      snapshot.origin('server.port'),
    ];

    expect(origins.map((origin) => origin?.inputReference)).toEqual([
      'APP_FEATURE',
      'APP_FEATURE',
      'APP_SERVER__PORT',
    ]);
    expect(JSON.stringify(origins)).not.toContain('8080');
    expect(JSON.stringify(origins)).not.toContain('enabled');
  });
});
