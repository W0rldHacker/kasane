import { describe, expect, it } from 'vitest';

import { KasaneMergeError, KasaneSecurityError } from '../../src/index.js';
import { normalizeConfigNode } from '../../src/normalize/index.js';
import type { ConfigObject } from '../../src/normalize/index.js';

function objectWithOwnKey(
  key: string,
  value: unknown,
): Record<string, unknown> {
  const object: Record<string, unknown> = {};
  Object.defineProperty(object, key, {
    configurable: true,
    enumerable: true,
    value,
    writable: true,
  });
  return object;
}

function captureError(input: unknown): KasaneMergeError | KasaneSecurityError {
  try {
    normalizeConfigNode(input);
  } catch (error) {
    if (
      error instanceof KasaneMergeError ||
      error instanceof KasaneSecurityError
    ) {
      return error;
    }
    throw error;
  }

  throw new Error('Expected normalization to fail');
}

function deeplyNested(depth: number): Record<string, unknown> {
  const root: Record<string, unknown> = {};
  let current = root;

  for (let index = 0; index < depth; index += 1) {
    const child: Record<string, unknown> = {};
    current['child'] = child;
    current = child;
  }

  current['value'] = true;
  return root;
}

describe('security normalization', () => {
  it.each(['__proto__', 'prototype', 'constructor'])(
    'rejects dangerous key %s at every level',
    (key) => {
      const input = { safe: objectWithOwnKey(key, { polluted: true }) };
      const error = captureError(input);

      expect(error).toBeInstanceOf(KasaneSecurityError);
      expect(error).toMatchObject({
        code: 'KASANE_SECURITY_ERROR',
        details: {
          kind: 'dangerous-key',
          operation: 'normalize',
          path: `safe.${key}`,
        },
      });
      expect(Reflect.get({}, 'polluted')).toBeUndefined();
    },
  );

  it('rejects constructor.prototype input without changing prototypes', () => {
    const payload = objectWithOwnKey(
      'constructor',
      objectWithOwnKey('prototype', { compromised: true }),
    );
    const before = Reflect.getPrototypeOf({});

    expect(captureError(payload)).toMatchObject({
      details: { path: 'constructor' },
    });
    expect(Reflect.getPrototypeOf({})).toBe(before);
    expect(Reflect.get({}, 'compromised')).toBeUndefined();
  });

  it('detects a direct cycle at its exact path', () => {
    const input: Record<string, unknown> = {};
    input['self'] = input;

    const error = captureError(input);
    expect(error).toBeInstanceOf(KasaneMergeError);
    expect(error).toMatchObject({
      code: 'KASANE_MERGE_ERROR',
      details: {
        kind: 'circular-reference',
        operation: 'normalize',
        path: 'self',
      },
    });
  });

  it('detects an indirect cycle at its exact path', () => {
    const first: Record<string, unknown> = {};
    const second: Record<string, unknown> = { back: first };
    first['next'] = second;

    expect(captureError(first)).toMatchObject({
      details: {
        kind: 'circular-reference',
        operation: 'normalize',
        path: 'next.back',
      },
    });
  });

  it('allows a shared child because it is not an ancestor cycle', () => {
    const shared = { enabled: true };
    const result = normalizeConfigNode({ first: shared, second: shared }) as
      ConfigObject | undefined;

    expect(result).toEqual({
      first: { enabled: true },
      second: { enabled: true },
    });
    expect(result?.['first']).not.toBe(shared);
    expect(result?.['second']).not.toBe(shared);
    expect(result?.['first']).not.toBe(result?.['second']);
  });

  it('rejects very deep input with a controlled error instead of RangeError', () => {
    const error = captureError(deeplyNested(10_000));

    expect(error).toBeInstanceOf(KasaneSecurityError);
    expect(error).not.toBeInstanceOf(RangeError);
    expect(error).toMatchObject({
      details: {
        kind: 'limit-exceeded',
        limits: { actualDepth: 65, maxDepth: 64 },
      },
    });
  });

  it('enforces limits independently in later branches', () => {
    const input = {
      first: { value: true },
      second: { nested: { tooDeep: true } },
    };

    let error: unknown;
    try {
      normalizeConfigNode(input, { maxDepth: 2 });
    } catch (thrown) {
      error = thrown;
    }

    expect(error).toBeInstanceOf(KasaneSecurityError);
    expect(error).toMatchObject({
      details: {
        kind: 'limit-exceeded',
        limits: { actualDepth: 3, maxDepth: 2 },
        path: 'second.nested.tooDeep',
      },
    });
  });
});
