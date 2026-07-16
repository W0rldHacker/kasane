import { describe, expect, it } from 'vitest';

import { KasaneSecurityError } from '../../../src/index.js';
import {
  DEFAULT_NORMALIZE_LIMITS,
  normalizeConfigNode,
  resolveNormalizeLimits,
} from '../../../src/normalize/index.js';

function nestedValue(depth: number): unknown {
  let value: unknown = 'leaf';
  for (let index = 0; index < depth; index += 1) {
    value = { child: value };
  }
  return value;
}

function captureSecurityError(
  input: unknown,
  limits: Parameters<typeof normalizeConfigNode>[1],
): KasaneSecurityError {
  try {
    normalizeConfigNode(input, limits);
  } catch (error) {
    if (error instanceof KasaneSecurityError) return error;
    throw error;
  }

  throw new Error('Expected security normalization to fail');
}

describe('normalization limits', () => {
  it('defines immutable documented defaults', () => {
    expect(DEFAULT_NORMALIZE_LIMITS).toEqual({
      maxDepth: 64,
      maxNodes: 100_000,
      maxStringLength: 1_000_000,
    });
    expect(Object.isFrozen(DEFAULT_NORMALIZE_LIMITS)).toBe(true);
  });

  it('merges partial overrides without reading inherited properties', () => {
    const limits = Object.create({ maxNodes: 1 }) as { maxDepth?: number };
    Object.defineProperty(limits, 'maxDepth', {
      enumerable: true,
      value: 2,
    });

    expect(resolveNormalizeLimits(limits)).toEqual({
      maxDepth: 2,
      maxNodes: 100_000,
      maxStringLength: 1_000_000,
    });
  });

  it('rejects invalid and accessor limit values without invoking getters', () => {
    let getterCalls = 0;
    const limits = Object.defineProperty({}, 'maxNodes', {
      get() {
        getterCalls += 1;
        return 10;
      },
    });

    expect(() => resolveNormalizeLimits({ maxDepth: -1 })).toThrow(
      KasaneSecurityError,
    );
    expect(() => resolveNormalizeLimits(limits)).toThrow(KasaneSecurityError);
    expect(getterCalls).toBe(0);
  });

  it('enforces maxDepth at the exact boundary with root depth zero', () => {
    expect(normalizeConfigNode(nestedValue(3), { maxDepth: 3 })).toEqual(
      nestedValue(3),
    );

    expect(captureSecurityError(nestedValue(4), { maxDepth: 3 })).toMatchObject(
      {
        details: {
          kind: 'limit-exceeded',
          limits: { actualDepth: 4, maxDepth: 3 },
          operation: 'normalize',
          path: 'child.child.child.child',
        },
      },
    );
  });

  it('counts containers and primitives toward maxNodes', () => {
    expect(normalizeConfigNode([1, 2], { maxNodes: 3 })).toEqual([1, 2]);

    expect(captureSecurityError([1, 2], { maxNodes: 2 })).toMatchObject({
      details: {
        kind: 'limit-exceeded',
        limits: { actualNodes: 3, maxNodes: 2 },
        operation: 'normalize',
        path: '1',
      },
    });
  });

  it('does not count omitted undefined object properties as nodes', () => {
    expect(
      normalizeConfigNode(
        { omitted: undefined, present: true },
        { maxNodes: 2 },
      ),
    ).toEqual({ present: true });
  });

  it('uses UTF-8 bytes for multi-byte string limits', () => {
    const value = 'é😀';
    expect(normalizeConfigNode(value, { maxStringLength: 6 })).toBe(value);

    expect(captureSecurityError(value, { maxStringLength: 5 })).toMatchObject({
      details: {
        kind: 'limit-exceeded',
        limits: { maxStringLength: 5, observedStringBytes: 6 },
        operation: 'normalize',
        path: '',
      },
    });
  });

  it('applies maxNodes to wide objects before allocating the next node', () => {
    const within = { a: 1, b: 2, c: 3 };
    const beyond = { a: 1, b: 2, c: 3, d: 4 };

    expect(normalizeConfigNode(within, { maxNodes: 4 })).toEqual(within);
    expect(captureSecurityError(beyond, { maxNodes: 4 })).toMatchObject({
      details: {
        kind: 'limit-exceeded',
        limits: { actualNodes: 5, maxNodes: 4 },
        operation: 'normalize',
        path: 'd',
      },
    });
  });
});
