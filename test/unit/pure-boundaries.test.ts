import { inspect } from 'node:util';

import { describe, expect, it } from 'vitest';

import {
  formatDiagnostic,
  FORMAT_TRUNCATION_MARKER,
} from '../../src/diagnostics/formatter.js';
import {
  isSafeDataArray,
  readSafeDataProperty,
} from '../../src/diagnostics/safe-data.js';
import {
  safeNormalizedRedaction,
  safeRedactedValue,
} from '../../src/diagnostics/safe-json.js';
import {
  KasaneError,
  KasaneLayerError,
  KasaneSecurityError,
} from '../../src/errors/index.js';
import {
  isPlainObject,
  normalizeConfigNode,
  resolveNormalizeLimits,
} from '../../src/normalize/index.js';
import {
  MAX_PATH_LENGTH,
  MAX_PATH_SEGMENTS,
  PathCache,
  parsePath,
  resolvePath,
  serializePath,
} from '../../src/paths/index.js';
import { createOriginRecord } from '../../src/provenance/origin.js';
import {
  createLayerRegistry,
  getRegistryIdentity,
  registerLayerSourceMetadata,
} from '../../src/provenance/registry.js';
import type {
  LayerId,
  LayerRegistry,
  SourceReferenceId,
} from '../../src/provenance/registry.js';
import {
  createContainerProvenanceNode,
  createLeafProvenanceNode,
  createProvenanceTree,
  getNearestTombstone,
  getProvenanceNode,
  withProvenanceChild,
} from '../../src/provenance/tree.js';
import {
  createSecretPathMatcher,
  isInSecretSubtree,
} from '../../src/secrets/matcher.js';
import { encodeCanonicalConfigNode } from '../../src/secrets/canonical.js';
import { REDACTED_VALUE } from '../../src/secrets/redact.js';
import {
  DEFAULT_KASANE_LIMITS,
  resolveKasaneLimits,
} from '../../src/security/limits.js';
import {
  builtInSource,
  getSourceMetadataResolver,
  isBuiltInSource,
  sourceMetadata,
} from '../../src/sources/metadata.js';
import type { LayerSource } from '../../src/sources/types.js';

function captureFailure(action: () => unknown): unknown {
  try {
    action();
  } catch (error) {
    return error;
  }
  throw new Error('Expected fixture action to fail');
}

describe('safe diagnostic primitives', () => {
  it.each([
    { expected: { kind: 'unsafe' }, value: null },
    { expected: { kind: 'unsafe' }, value: 1 },
    { expected: { kind: 'absent' }, value: {} },
    { expected: { kind: 'data', value: 42 }, value: { field: 42 } },
    {
      expected: { kind: 'unsafe' },
      value: Object.defineProperty({}, 'field', { get: () => 42 }),
    },
    { expected: { kind: 'unsafe' }, value: new Proxy({}, {}) },
  ])('reads only an own data property from $value', ({ expected, value }) => {
    expect(readSafeDataProperty(value, 'field')).toEqual(expected);
  });

  it('accepts functions as data objects without invoking them', () => {
    const callable = Object.assign(() => 'not called', { field: 'safe' });
    expect(readSafeDataProperty(callable, 'field')).toEqual({
      kind: 'data',
      value: 'safe',
    });
  });

  it.each([
    [[], true],
    [{}, false],
    [null, false],
    [new Proxy([], {}), false],
  ] as const)(
    'classifies safe arrays without traversing %#',
    (value, expected) => {
      expect(isSafeDataArray(value)).toBe(expected);
    },
  );

  it('exposes central normalized redaction and placeholder bridges', () => {
    const policy = createSecretPathMatcher(['token']);
    expect(
      safeNormalizedRedaction(
        { public: true, token: 'fixture-private' },
        policy,
        () => false,
      ),
    ).toEqual({ public: true, token: REDACTED_VALUE });
    expect(safeRedactedValue()).toBe(REDACTED_VALUE);
  });

  it.each([
    [null, 'null'],
    [[], '[]'],
    [{}, '{}'],
    [[1, { nested: true }], '[\n  1,\n  {\n    "nested": true\n  }\n]'],
  ] as const)(
    'formats deterministic diagnostic fixture %#',
    (value, expected) => {
      expect(formatDiagnostic(value)).toBe(expected);
    },
  );

  it('adds one stable marker after exhausting the formatter budget', () => {
    const output = formatDiagnostic('x'.repeat(100_001));
    expect(output.endsWith(`\n${FORMAT_TRUNCATION_MARKER}`)).toBe(true);
  });
});

describe('error sanitization boundaries', () => {
  it('ignores non-object and proxied options', () => {
    expect(new KasaneError(undefined, 1 as never).toJSON()).toEqual({
      code: 'KASANE_ERROR',
      details: {},
      message: 'Kasane operation failed.',
      name: 'KasaneError',
    });
    expect(
      new KasaneError(undefined, new Proxy({}, {}) as never).details,
    ).toEqual({});
  });

  it('filters invalid details and caps safe numeric limits at sixteen', () => {
    const limits: Record<string, unknown> = {
      __proto__: 1,
      constructor: 2,
      invalid$name: 3,
      infinite: Number.POSITIVE_INFINITY,
      text: '4',
    };
    for (let index = 0; index < 20; index += 1) {
      limits[`limit${String(index).padStart(2, '0')}`] = index;
    }
    Object.defineProperty(limits, 'accessor', { get: () => 5 });

    const error = new KasaneError(undefined, {
      details: {
        kind: 1 as never,
        layerId: -1,
        limits: limits as Record<string, number>,
        path: 'safe.path',
      },
    });
    expect(error.details.path).toBe('safe.path');
    expect(error.details).not.toHaveProperty('kind');
    expect(error.details).not.toHaveProperty('layerId');
    expect(Object.keys(error.details.limits ?? {})).toHaveLength(16);
    expect(error.details.limits).not.toHaveProperty('constructor');
    expect(error.details.limits).not.toHaveProperty('invalid$name');
  });

  it.each([undefined, null, 1, new Proxy({}, {})])(
    'omits unsafe limits value %#',
    (limits) => {
      expect(
        new KasaneError(undefined, {
          details: { limits: limits as never },
        }).details,
      ).toEqual({});
    },
  );

  it.each([
    [new TypeError('fixture'), 'TypeError'],
    [new SyntaxError('fixture'), 'SyntaxError'],
    [{ name: 'NotAllowlistedError' }, 'ExternalError'],
    [() => undefined, 'ExternalError'],
    [new Proxy(new Error('fixture'), {}), 'ExternalError'],
  ] as const)('summarizes external cause %# as %s', (cause, name) => {
    const error = new KasaneError(undefined, { cause });
    expect(error.cause).toEqual({ name });
    expect(inspect(error)).not.toContain('fixture');
  });
});

describe('normalization and security limit boundaries', () => {
  it('rejects revoked object inspection without leaking a platform error', () => {
    const revoked = Proxy.revocable({}, {});
    revoked.revoke();
    expect(isPlainObject(revoked.proxy)).toBe(false);
    expect(
      captureFailure(() => normalizeConfigNode(revoked.proxy)),
    ).toMatchObject({ code: 'KASANE_MERGE_ERROR' });
  });

  it.each([null, 1, '1'])('rejects invalid limit container %#', (limits) => {
    expect(() => resolveNormalizeLimits(limits as never)).toThrow(
      KasaneSecurityError,
    );
  });

  it.each([
    Number.NaN,
    Number.POSITIVE_INFINITY,
    1.5,
    -1,
    Number.MAX_SAFE_INTEGER + 1,
  ])('rejects invalid numeric normalization limit %s', (maxNodes) => {
    expect(() => resolveNormalizeLimits({ maxNodes })).toThrow(
      KasaneSecurityError,
    );
  });

  it('rejects uninspectable normalization limits', () => {
    const revoked = Proxy.revocable({}, {});
    revoked.revoke();
    expect(() => resolveNormalizeLimits(revoked.proxy)).toThrow(
      KasaneSecurityError,
    );
  });

  it.each(['__proto__', 'prototype', 'constructor'])(
    'rejects dangerous array key %s as a security branch',
    (key) => {
      const array: unknown[] = [];
      Object.defineProperty(array, key, {
        configurable: true,
        enumerable: true,
        value: true,
      });
      expect(captureFailure(() => normalizeConfigNode(array))).toMatchObject({
        code: 'KASANE_SECURITY_ERROR',
        details: { kind: 'dangerous-key' },
      });
    },
  );

  it.each([
    ['named array property', Object.assign([], { extra: true })],
    [
      'non-canonical array property',
      Object.defineProperty([], '01', {
        configurable: true,
        enumerable: true,
        value: true,
      }),
    ],
  ])('rejects %s', (_name, value) => {
    expect(() => normalizeConfigNode(value)).toThrow();
  });

  it('resolves source bytes at boundary and validates every invalid shape', () => {
    expect(resolveKasaneLimits()).toBe(DEFAULT_KASANE_LIMITS);
    expect(resolveKasaneLimits({ maxSourceBytes: 0 })).toMatchObject({
      maxSourceBytes: 0,
    });
    expect(
      resolveKasaneLimits({ maxSourceBytes: undefined } as never),
    ).toMatchObject({
      maxSourceBytes: 10_000_000,
    });
    for (const input of [
      null,
      1,
      { maxSourceBytes: -1 },
      { maxSourceBytes: 1.5 },
    ]) {
      expect(() => resolveKasaneLimits(input as never)).toThrow(
        KasaneSecurityError,
      );
    }
    const accessor = Object.defineProperty({}, 'maxSourceBytes', {
      get: () => 1,
    });
    expect(() => resolveKasaneLimits(accessor)).toThrow(KasaneSecurityError);
    const revoked = Proxy.revocable({}, {});
    revoked.revoke();
    expect(() => resolveKasaneLimits(revoked.proxy)).toThrow(
      KasaneSecurityError,
    );
  });
});

describe('path grammar and cache boundaries', () => {
  it('accepts exact path length and segment limits', () => {
    expect(parsePath('x'.repeat(MAX_PATH_LENGTH))).toEqual([
      'x'.repeat(MAX_PATH_LENGTH),
    ]);
    const segments = Array.from({ length: MAX_PATH_SEGMENTS }, () => 'x');
    expect(parsePath(segments.join('.'))).toHaveLength(MAX_PATH_SEGMENTS);
    expect(serializePath(segments)).toBe(segments.join('.'));
  });

  it.each([
    ['non-string', 1],
    ['empty serialized segment', ['']],
  ])('rejects %s', (_name, value) => {
    const action = Array.isArray(value)
      ? () => serializePath(value)
      : () => parsePath(value as never);
    expect(captureFailure(action)).toMatchObject({ code: 'KASANE_PATH_ERROR' });
  });

  it.each(['00', '-1', '+1', String(Number.MAX_SAFE_INTEGER + 1)])(
    'does not resolve array index %s outside canonical bounds',
    (segment) => {
      expect(resolvePath(['zero'], [segment])).toEqual({ found: false });
    },
  );

  it('resolves canonical zero array index', () => {
    expect(resolvePath(['zero'], ['0'])).toEqual({
      found: true,
      value: 'zero',
    });
  });

  it('stops at scalar and missing own properties', () => {
    expect(resolvePath({ value: 1 }, ['value', 'nested'])).toEqual({
      found: false,
    });
    expect(resolvePath({}, ['missing'])).toEqual({ found: false });
  });

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    'rejects cache limit %s',
    (limit) => {
      expect(() => new PathCache(limit)).toThrow(RangeError);
    },
  );
});

describe('provenance registry and immutable tree boundaries', () => {
  it.each([
    [{ name: '', kind: 'value' }, 'empty-layer-name'],
    [{ name: 'layer', kind: '' }, 'empty-layer-kind'],
    [
      { name: 'layer', kind: 'value', source: { reference: '' } },
      'empty-source-reference',
    ],
  ] as const)('rejects registry declaration %#', (registration, kind) => {
    expect(
      captureFailure(() => createLayerRegistry([registration])),
    ).toMatchObject({ details: { kind } });
  });

  it('registers late metadata once and rejects foreign registries', () => {
    const registry = createLayerRegistry([{ name: 'layer', kind: 'custom' }]);
    registerLayerSourceMetadata(registry, 'layer', {
      inputReferences: ['input'],
      pathReferences: [{ path: 'value', reference: 'path-input' }],
      reference: 'source',
    });
    expect(registry.referenceCount).toBe(3);
    expect(registry.getLayerByName('layer')).toHaveProperty(
      'sourceReferenceId',
    );
    expect(() => {
      registerLayerSourceMetadata(registry, 'layer', {});
    }).toThrow(KasaneLayerError);
    expect(() => {
      registerLayerSourceMetadata(registry, 'missing', {});
    }).toThrow(KasaneLayerError);
    const foreign = {
      getLayer: () => undefined,
      getLayerByName: () => undefined,
      getReference: () => undefined,
      getReferenceId: () => undefined,
      referenceCount: 0,
      size: 0,
    } satisfies LayerRegistry;
    expect(() => {
      registerLayerSourceMetadata(foreign, 'layer', {});
    }).toThrow(KasaneLayerError);
    expect(() => getRegistryIdentity(foreign)).toThrow(KasaneLayerError);
  });

  it('rejects unknown local layer and reference identifiers', () => {
    const registry = createLayerRegistry([{ name: 'layer', kind: 'value' }]);
    const layer = registry.getLayerByName('layer');
    if (layer === undefined) throw new Error('Missing fixture layer');
    expect(() =>
      createOriginRecord(registry, 99 as LayerId, {
        operation: 'set',
        scope: 'leaf',
        secret: false,
      }),
    ).toThrow(KasaneLayerError);
    expect(() =>
      createOriginRecord(registry, layer.id, {
        inputReferenceId: 99 as SourceReferenceId,
        operation: 'set',
        scope: 'leaf',
        secret: false,
      }),
    ).toThrow(KasaneLayerError);
  });

  it('implements every immutable child-map operation and persistent update', () => {
    const registry = createLayerRegistry([{ name: 'layer', kind: 'value' }]);
    const layer = registry.getLayerByName('layer');
    if (layer === undefined) throw new Error('Missing layer');
    const leafOrigin = createOriginRecord(registry, layer.id, {
      operation: 'set',
      scope: 'leaf',
      secret: false,
    });
    const containerOrigin = createOriginRecord(registry, layer.id, {
      operation: 'set',
      scope: 'container',
      secret: false,
    });
    const leaf = createLeafProvenanceNode(leafOrigin);
    const container = createContainerProvenanceNode('object', containerOrigin, [
      ['value', leaf],
    ]);
    const visited: string[] = [];
    expect([...container.children.entries()]).toEqual([['value', leaf]]);
    expect([...container.children.keys()]).toEqual(['value']);
    expect([...container.children.values()]).toEqual([leaf]);
    expect(container.children.has('value')).toBe(true);
    container.children.forEach((_value, key, map) => {
      visited.push(key);
      expect(map).toBe(container.children);
    });
    expect(visited).toEqual(['value']);

    const removed = withProvenanceChild(container, 'value', undefined);
    expect(removed.children.size).toBe(0);
    const restored = withProvenanceChild(removed, 'value', leaf);
    expect(restored.children.get('value')).toBe(leaf);

    const tree = createProvenanceTree(restored);
    expect(getProvenanceNode(tree, [])).toBe(restored);
    expect(getProvenanceNode(tree, ['missing'])).toBeUndefined();
    expect(getNearestTombstone(tree, ['missing'])).toBeUndefined();
    expect(
      getNearestTombstone(createProvenanceTree(), ['missing']),
    ).toBeUndefined();
  });
});

describe('secret path matcher negative grammar', () => {
  it.each([
    [1, 'invalid-secret-paths'],
    [[1], 'non-string-secret-path'],
    [['bad\\escape'], 'invalid-secret-path'],
    [['constructor'], 'dangerous-secret-segment'],
    [['**'], 'unsupported-recursive-secret-wildcard'],
  ] as const)('rejects declaration %#', (declaration, kind) => {
    expect(
      captureFailure(() => createSecretPathMatcher(declaration)),
    ).toMatchObject({ details: { kind } });
  });

  it('supports no-policy, root, escaped parent, and exact subtree roots', () => {
    expect(createSecretPathMatcher(undefined).matches('anything')).toBe(false);
    expect(isInSecretSubtree(undefined, 'value')).toBe(false);
    expect(isInSecretSubtree(new Set(['']), 'value')).toBe(true);
    expect(isInSecretSubtree(new Set(['a\\.b']), 'a\\.b.child')).toBe(true);
    expect(isInSecretSubtree(new Set(['a']), 'ab')).toBe(false);
  });
});

describe('canonical and source metadata defensive boundaries', () => {
  it('rejects non-finite canonical numbers and canonicalizes negative zero', () => {
    expect(() => encodeCanonicalConfigNode(Number.NaN as never)).toThrow(
      TypeError,
    );
    expect(encodeCanonicalConfigNode(-0)).toBe(encodeCanonicalConfigNode(0));
  });

  it.each([
    { expected: false, source: { kind: 'custom', load: () => undefined } },
    {
      expected: false,
      source: Object.defineProperty(
        { kind: 'custom', load: () => undefined },
        builtInSource,
        { value: false },
      ),
    },
    {
      expected: false,
      source: Object.defineProperty(
        { kind: 'custom', load: () => undefined },
        builtInSource,
        { get: () => true },
      ),
    },
    {
      expected: true,
      source: Object.defineProperty(
        { kind: 'value', load: () => undefined },
        builtInSource,
        { value: true },
      ),
    },
  ] satisfies readonly Readonly<{
    expected: boolean;
    source: LayerSource;
  }>[])('identifies built-in source fixture %#', ({ expected, source }) => {
    expect(isBuiltInSource(source)).toBe(expected);
  });

  it('fails closed for an uninspectable source', () => {
    const revoked = Proxy.revocable(
      { kind: 'custom', load: () => undefined },
      {},
    );
    revoked.revoke();
    expect(isBuiltInSource(revoked.proxy)).toBe(false);
  });

  it('returns only callable source metadata resolvers', () => {
    const resolver = () => ({ reference: 'fixture-source' });
    const withResolver = Object.assign(
      { kind: 'custom', load: () => undefined },
      { [sourceMetadata]: resolver },
    );
    const withoutResolver = Object.assign(
      { kind: 'custom', load: () => undefined },
      { [sourceMetadata]: 'not-callable' },
    ) as unknown as LayerSource;

    expect(getSourceMetadataResolver(withResolver)).toBe(resolver);
    expect(getSourceMetadataResolver(withoutResolver)).toBeUndefined();
  });
});
