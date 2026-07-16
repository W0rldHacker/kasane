import { describe, expect, expectTypeOf, it } from 'vitest';

import { KasaneMergeError } from '../../../src/index.js';
import {
  isPlainObject,
  normalizeConfigNode,
} from '../../../src/normalize/index.js';
import type {
  ConfigArray,
  ConfigNode,
  ConfigObject,
  ConfigPrimitive,
} from '../../../src/normalize/index.js';

const unsupportedValues = [
  ['BigInt', 1n],
  ['function', () => undefined],
  ['Date', new Date(0)],
  ['Map', new Map()],
  ['Set', new Set()],
  ['NaN', Number.NaN],
  ['Infinity', Number.POSITIVE_INFINITY],
] as const;

function captureNormalizationError(input: unknown): KasaneMergeError {
  try {
    normalizeConfigNode(input);
  } catch (error) {
    if (error instanceof KasaneMergeError) return error;
    throw error;
  }

  throw new Error('Expected normalization to fail');
}

describe('canonical ConfigNode types', () => {
  it('describe the complete recursive plain-data model', () => {
    expectTypeOf<null>().toExtend<ConfigPrimitive>();
    expectTypeOf<ConfigArray>().toExtend<ConfigNode>();
    expectTypeOf<ConfigObject>().toExtend<ConfigNode>();
    expectTypeOf<bigint>().not.toExtend<ConfigNode>();
  });
});

describe('isPlainObject', () => {
  it('accepts only Object.prototype and null prototypes', () => {
    expect(isPlainObject({})).toBe(true);
    expect(isPlainObject(Object.create(null))).toBe(true);
    expect(isPlainObject([])).toBe(false);
    expect(isPlainObject(new Date())).toBe(false);
    expect(isPlainObject(new Map())).toBe(false);
  });
});

describe('normalizeConfigNode', () => {
  it.each([
    ['null', null, null],
    ['true', true, true],
    ['false', false, false],
    ['string', 'value', 'value'],
    ['zero', 0, 0],
    ['finite number', 42.5, 42.5],
  ] as const)('accepts the %s primitive', (_name, input, expected) => {
    expect(normalizeConfigNode(input)).toBe(expected);
  });

  it('normalizes negative zero to positive zero', () => {
    const result = normalizeConfigNode(-0);
    expect(result).toBe(0);
    expect(Object.is(result, -0)).toBe(false);
  });

  it('treats root undefined as an empty layer', () => {
    expect(normalizeConfigNode(undefined)).toBeUndefined();
  });

  it('omits undefined object properties and preserves array order', () => {
    expect(
      normalizeConfigNode({
        omitted: undefined,
        ordered: ['first', null, 3, 'last'],
      }),
    ).toEqual({ ordered: ['first', null, 3, 'last'] });
  });

  it('copies null-prototype input into an ordinary detached object', () => {
    const nested = { enabled: true };
    const input = { nested };
    Object.setPrototypeOf(input, null);

    const result = normalizeConfigNode(input);
    expect(result).toEqual({ nested: { enabled: true } });
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
    expect(result).not.toBe(input);
    if (
      result === undefined ||
      result === null ||
      Array.isArray(result) ||
      typeof result !== 'object'
    ) {
      throw new Error('Expected a normalized object');
    }
    expect(result['nested']).not.toBe(nested);

    nested.enabled = false;
    expect(result).toEqual({ nested: { enabled: true } });
  });

  it('duplicates a shared non-cyclic input without retaining aliases', () => {
    const shared = { port: 5432 };
    const result = normalizeConfigNode({ primary: shared, replica: shared });

    expect(result).toEqual({
      primary: { port: 5432 },
      replica: { port: 5432 },
    });
    if (
      result === undefined ||
      result === null ||
      Array.isArray(result) ||
      typeof result !== 'object'
    ) {
      throw new Error('Expected a normalized object');
    }
    expect(result['primary']).not.toBe(shared);
    expect(result['replica']).not.toBe(shared);
    expect(result['primary']).not.toBe(result['replica']);
  });

  it('does not invoke an accessor and reports its canonical path', () => {
    let getterCalls = 0;
    const input = {
      database: Object.defineProperty({}, 'password', {
        enumerable: true,
        get() {
          getterCalls += 1;
          return 'GETTER_CANARY';
        },
      }),
    };

    expect(captureNormalizationError(input)).toMatchObject({
      code: 'KASANE_MERGE_ERROR',
      details: {
        kind: 'accessor-property',
        operation: 'normalize',
        path: 'database.password',
      },
    });
    expect(getterCalls).toBe(0);
  });

  it('rejects a sparse array', () => {
    const input = new Array<unknown>(2);
    input[1] = 'present';

    expect(captureNormalizationError({ items: input })).toMatchObject({
      code: 'KASANE_MERGE_ERROR',
      details: {
        kind: 'sparse-array',
        operation: 'normalize',
        path: 'items',
      },
    });
  });

  it('rejects undefined inside an array at the exact index', () => {
    expect(
      captureNormalizationError({ items: ['ok', undefined] }),
    ).toMatchObject({
      details: {
        kind: 'undefined-array-item',
        operation: 'normalize',
        path: 'items.1',
      },
    });
  });

  it.each(unsupportedValues)('rejects %s with a safe path', (_name, value) => {
    const error = captureNormalizationError({ 'invalid.value': value });

    expect(error).toBeInstanceOf(KasaneMergeError);
    expect(error).toMatchObject({
      code: 'KASANE_MERGE_ERROR',
      details: { path: 'invalid\\.value', operation: 'normalize' },
    });
    expect(error.message).toBe('Unsupported configuration value.');
  });

  it('rejects symbol keys, non-enumerable properties, and array accessors', () => {
    const withSymbol = { [Symbol('secret')]: 'value' };
    const nonEnumerable = Object.defineProperty({}, 'hidden', {
      enumerable: false,
      value: true,
    });
    const accessorArray: unknown[] = [];
    Object.defineProperty(accessorArray, '0', {
      enumerable: true,
      get: () => 'value',
    });

    for (const input of [withSymbol, nonEnumerable, accessorArray]) {
      expect(() => normalizeConfigNode(input)).toThrow(KasaneMergeError);
    }
  });
});
