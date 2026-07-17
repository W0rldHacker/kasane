import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import {
  KasaneError,
  KasaneSourceError,
  kasane,
  value,
} from '../../src/index.js';
import { PathCache } from '../../src/paths/index.js';

describe('security hardening', () => {
  it('keeps path cache memory fixed under a path flood', () => {
    const cache = new PathCache(16);
    for (let index = 0; index < 10_000; index += 1) {
      cache.parse(`path${String(index)}`);
    }

    expect(cache.size).toBe(16);
    expect(cache.has('path9999')).toBe(true);
    expect(cache.has('path0')).toBe(false);
  });

  it('does not retain a malicious source error message or hooks', async () => {
    const canary = 'MALICIOUS_SOURCE_ERROR_CANARY';
    let hookCalls = 0;
    const cause = new Error(canary) as Error & {
      toJSON?: () => string;
    };
    Object.defineProperties(cause, {
      toJSON: {
        value() {
          hookCalls += 1;
          return canary;
        },
      },
      toString: {
        value() {
          hookCalls += 1;
          return canary;
        },
      },
    });
    let failure: unknown;
    try {
      await kasane({
        layers: [
          {
            name: 'hostile',
            source: {
              kind: 'custom',
              load() {
                throw cause;
              },
            },
          },
        ],
      });
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(KasaneSourceError);
    expect(JSON.stringify(failure)).not.toContain(canary);
    expect((failure as Error).stack).not.toContain(canary);
    expect(hookCalls).toBe(0);

    let kasaneFailure: unknown;
    try {
      await kasane({
        layers: [
          {
            name: 'forged-library-error',
            source: {
              kind: 'custom',
              load() {
                throw new KasaneSourceError(canary);
              },
            },
          },
        ],
      });
    } catch (error) {
      kasaneFailure = error;
    }
    expect(kasaneFailure).toBeInstanceOf(KasaneSourceError);
    expect((kasaneFailure as Error).message).toBe(
      'Configuration source failed.',
    );
    expect(JSON.stringify(kasaneFailure)).not.toContain(canary);
    expect((kasaneFailure as Error).stack).not.toContain(canary);
  });

  it('ignores a poisoned Object prototype during normalization and lookup', async () => {
    const property = 'SEC004_INHERITED_CANARY';
    Object.defineProperty(Object.prototype, property, {
      configurable: true,
      enumerable: true,
      value: 'poisoned',
      writable: true,
    });

    try {
      const snapshot = await kasane({
        layers: [value('safe', { nested: { visible: true } })],
      });
      expect(snapshot.value).toEqual({ nested: { visible: true } });
      expect(snapshot.has(property)).toBe(false);
      expect(snapshot.get(`nested.${property}`)).toBeUndefined();
      expect(JSON.stringify(snapshot)).not.toContain('poisoned');
    } finally {
      Reflect.deleteProperty(Object.prototype, property);
    }
  });

  it('truncates explain, diff, and error diagnostic surfaces', async () => {
    const longText = 'x'.repeat(110_000);
    const snapshot = await kasane({
      layers: [value('large', { longText })],
    });
    const explanation = snapshot.explain('longText');
    expect(explanation.format()).toContain('[TRUNCATED]');
    expect(explanation.format().length).toBeLessThanOrEqual(100_012);

    const before = await kasane({
      layers: [
        value(
          'array',
          Array.from({ length: 1_001 }, (_, index) => index),
        ),
      ],
    });
    const after = await kasane({
      layers: [
        value(
          'array',
          Array.from({ length: 1_001 }, (_, index) => index + 1),
        ),
      ],
    });
    expect(JSON.stringify(before.diff(after))).toContain('[TRUNCATED]');

    const error = new KasaneError('e'.repeat(110_000));
    expect(JSON.stringify(error)).toContain('[TRUNCATED]');
  });

  it('documents Proxy and extension code as trusted executable code', async () => {
    const threatModel = await readFile(
      new URL('../../docs/threat-model.md', import.meta.url),
      'utf8',
    );

    expect(threatModel).toContain(
      'Custom source, custom parser, validator, and Proxy behavior',
    );
    expect(threatModel).toContain('does not sandbox execution');
    expect(threatModel).toContain('10,000,000 bytes');
  });
});
