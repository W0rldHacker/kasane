import { describe, expect, it } from 'vitest';

import { KasanePathError } from '../../../src/errors/index.js';
import type { ConfigNode } from '../../../src/normalize/types.js';
import {
  MAX_PATH_LENGTH,
  MAX_PATH_SEGMENTS,
  PathCache,
  parsePath,
  resolvePath,
  serializePath,
} from '../../../src/paths/index.js';
import {
  invalidPathFixtures,
  validPathFixtures,
} from '../../fixtures/paths.js';

describe('canonical paths', () => {
  it.each(validPathFixtures)('parses $path', ({ path, segments }) => {
    const parsed = parsePath(path);
    expect(parsed).toEqual(segments);
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(serializePath(parsed)).toBe(path);
  });

  it.each(invalidPathFixtures)('rejects malformed path %s', (path) => {
    expect(() => parsePath(path)).toThrow(KasanePathError);
  });

  it('bounds path length and segment count', () => {
    expect(() => parsePath('x'.repeat(MAX_PATH_LENGTH + 1))).toThrow(
      KasanePathError,
    );
    expect(() =>
      parsePath(
        Array.from({ length: MAX_PATH_SEGMENTS + 1 }, () => 'x').join('.'),
      ),
    ).toThrow(KasanePathError);
    expect(() => serializePath(['x'.repeat(MAX_PATH_LENGTH + 1)])).toThrow(
      KasanePathError,
    );
    expect(() =>
      serializePath(Array.from({ length: MAX_PATH_SEGMENTS + 1 }, () => 'x')),
    ).toThrow(KasanePathError);
  });

  it('resolves arrays only through canonical safe indices', () => {
    const value: ConfigNode = {
      items: [{ name: 'zero' }, { name: 'one' }],
      object: { '0': 'object zero', '01': 'object leading zero' },
    };

    expect(resolvePath(value, parsePath('items.0.name'))).toEqual({
      found: true,
      value: 'zero',
    });
    expect(resolvePath(value, parsePath('object.0'))).toEqual({
      found: true,
      value: 'object zero',
    });
    expect(resolvePath(value, parsePath('object.01'))).toEqual({
      found: true,
      value: 'object leading zero',
    });

    for (const path of ['items.-1', 'items.+1', 'items.01', 'items.2']) {
      expect(resolvePath(value, parsePath(path))).toEqual({ found: false });
    }
  });

  it('never traverses inherited or dangerous properties', () => {
    const dangerous = {} as Record<string, ConfigNode>;
    Object.defineProperty(dangerous, 'constructor', {
      enumerable: true,
      value: 'own but forbidden',
      writable: true,
    });
    Object.defineProperty(dangerous, '__proto__', {
      enumerable: true,
      value: 'own but forbidden',
      writable: true,
    });

    for (const path of ['toString', 'constructor', '__proto__', 'prototype']) {
      expect(resolvePath(dangerous, parsePath(path))).toEqual({ found: false });
    }
  });

  it('evicts the least-recently-used entry at a fixed bound', () => {
    const cache = new PathCache(2);
    cache.parse('first');
    cache.parse('second');
    cache.parse('first');
    cache.parse('third');

    expect(cache.size).toBe(2);
    expect(cache.has('first')).toBe(true);
    expect(cache.has('second')).toBe(false);
    expect(cache.has('third')).toBe(true);
  });
});
