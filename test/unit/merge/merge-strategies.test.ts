import { describe, expect, it } from 'vitest';

import { KasaneMergeError, remove } from '../../../src/index.js';
import {
  createMergeRuleIndex,
  mergeConfigNodes,
} from '../../../src/merge/index.js';
import type {
  MergeLayerNode,
  MergeOutput,
  MergeRule,
  MergeStrategy,
} from '../../../src/merge/index.js';
import {
  normalizeConfigNode,
  normalizeLayerNode,
} from '../../../src/normalize/index.js';
import type {
  ConfigArray,
  ConfigNode,
  ConfigObject,
} from '../../../src/normalize/index.js';
import { createLayerRegistry } from '../../../src/provenance/registry.js';
import type {
  LayerRecord,
  LayerRegistry,
} from '../../../src/provenance/registry.js';
import {
  getProvenanceNode,
  type ProvenanceTree,
} from '../../../src/provenance/tree.js';

function registryWith(...names: readonly string[]): LayerRegistry {
  return createLayerRegistry(names.map((name) => ({ kind: 'value', name })));
}

function requireLayer(registry: LayerRegistry, name: string): LayerRecord {
  const layer = registry.getLayerByName(name);
  if (layer === undefined) throw new Error(`Missing test layer: ${name}`);
  return layer;
}

function applyLayer(
  registry: LayerRegistry,
  layerName: string,
  layer: MergeLayerNode | undefined,
  previous?: MergeOutput,
  rules: readonly MergeRule[] = [],
): MergeOutput {
  return mergeConfigNodes({
    base: previous?.value,
    layer,
    layerId: requireLayer(registry, layerName).id,
    provenanceMode: 'origin-only',
    registry,
    rules: createMergeRuleIndex(rules),
    ...(previous?.provenance === undefined
      ? {}
      : { baseProvenance: previous.provenance }),
  });
}

function requireTree(output: MergeOutput): ProvenanceTree {
  if (output.provenance === undefined) throw new Error('Missing provenance');
  return output.provenance;
}

function requireObject(value: ConfigNode | undefined): ConfigObject {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Expected object value');
  }
  return value;
}

function requireArray(value: ConfigNode | undefined): ConfigArray {
  if (!Array.isArray(value)) throw new Error('Expected array value');
  return value;
}

function captureMergeError(action: () => unknown): KasaneMergeError {
  try {
    action();
  } catch (error: unknown) {
    if (error instanceof KasaneMergeError) return error;
    throw error;
  }
  throw new Error('Expected KasaneMergeError');
}

describe('append and prepend strategies', () => {
  it.each(['append', 'prepend'] as const)(
    '%s preserves an existing array when the incoming array is empty',
    (strategy) => {
      const registry = registryWith('defaults', 'override');
      const defaults = applyLayer(registry, 'defaults', {
        items: [{ id: 'old' }],
      });
      const oldOrigin = getProvenanceNode(requireTree(defaults), [
        'items',
        '0',
      ]);
      const result = applyLayer(registry, 'override', { items: [] }, defaults, [
        { path: 'items', strategy },
      ]);

      expect(result.value).toEqual({ items: [{ id: 'old' }] });
      expect(getProvenanceNode(requireTree(result), ['items', '0'])).toBe(
        oldOrigin,
      );
      expect(getProvenanceNode(requireTree(result), ['items'])).toMatchObject({
        current: {
          layerId: requireLayer(registry, 'override').id,
          operation: strategy,
        },
      });
    },
  );

  it.each(['append', 'prepend'] as const)(
    '%s initializes an absent array with set semantics',
    (strategy) => {
      const registry = registryWith('defaults', 'override');
      const defaults = applyLayer(registry, 'defaults', {});
      const result = applyLayer(
        registry,
        'override',
        { items: [{ id: 'new' }] },
        defaults,
        [{ path: 'items', strategy }],
      );

      expect(result.value).toEqual({ items: [{ id: 'new' }] });
      expect(getProvenanceNode(requireTree(result), ['items'])).toMatchObject({
        current: { operation: 'set' },
      });
    },
  );

  it.each(['append', 'prepend'] as const)(
    '%s combines a present empty array with incoming elements',
    (strategy) => {
      const registry = registryWith('defaults', 'override');
      const defaults = applyLayer(registry, 'defaults', { items: [] });
      const result = applyLayer(
        registry,
        'override',
        { items: [{ id: 'new' }] },
        defaults,
        [{ path: 'items', strategy }],
      );

      expect(result.value).toEqual({ items: [{ id: 'new' }] });
      expect(getProvenanceNode(requireTree(result), ['items'])).toMatchObject({
        current: { operation: strategy },
      });
      expect(
        getProvenanceNode(requireTree(result), ['items', '0']),
      ).toMatchObject({
        current: {
          layerId: requireLayer(registry, 'override').id,
          operation: 'set',
        },
      });
    },
  );

  it('appends object elements without deduplication or input mutation', () => {
    const registry = registryWith('defaults', 'override');
    const baseInput: ConfigNode = { items: [{ id: 'same' }] };
    const layerInput: ConfigNode = {
      items: [{ id: 'new' }, { id: 'same' }],
    };
    const baseBefore = JSON.stringify(baseInput);
    const layerBefore = JSON.stringify(layerInput);
    const defaults = applyLayer(registry, 'defaults', baseInput);
    const oldOrigin = getProvenanceNode(requireTree(defaults), ['items', '0']);
    const result = applyLayer(registry, 'override', layerInput, defaults, [
      { path: 'items', strategy: 'append' },
    ]);
    const items = requireArray(requireObject(result.value)['items']);

    expect(items).toEqual([{ id: 'same' }, { id: 'new' }, { id: 'same' }]);
    expect(JSON.stringify(baseInput)).toBe(baseBefore);
    expect(JSON.stringify(layerInput)).toBe(layerBefore);
    expect(items).not.toBe(requireObject(layerInput)['items']);
    expect(items[1]).not.toBe(
      requireArray(requireObject(layerInput)['items'])[0],
    );
    expect(getProvenanceNode(requireTree(result), ['items', '0'])).toBe(
      oldOrigin,
    );
    expect(
      getProvenanceNode(requireTree(result), ['items', '1']),
    ).toMatchObject({
      current: {
        layerId: requireLayer(registry, 'override').id,
        operation: 'set',
      },
    });
  });

  it('prepends and remaps every retained provenance index', () => {
    const registry = registryWith('defaults', 'override');
    const baseInput: ConfigNode = {
      items: [{ id: 'old-0' }, { id: 'old-1' }],
    };
    const layerInput: ConfigNode = { items: [{ id: 'new' }] };
    const baseBefore = JSON.stringify(baseInput);
    const layerBefore = JSON.stringify(layerInput);
    const defaults = applyLayer(registry, 'defaults', baseInput);
    const oldZero = getProvenanceNode(requireTree(defaults), ['items', '0']);
    const oldOne = getProvenanceNode(requireTree(defaults), ['items', '1']);
    const result = applyLayer(registry, 'override', layerInput, defaults, [
      { path: 'items', strategy: 'prepend' },
    ]);

    expect(result.value).toEqual({
      items: [{ id: 'new' }, { id: 'old-0' }, { id: 'old-1' }],
    });
    expect(JSON.stringify(baseInput)).toBe(baseBefore);
    expect(JSON.stringify(layerInput)).toBe(layerBefore);
    expect(
      getProvenanceNode(requireTree(result), ['items', '0']),
    ).toMatchObject({
      current: { layerId: requireLayer(registry, 'override').id },
    });
    expect(getProvenanceNode(requireTree(result), ['items', '1'])).toBe(
      oldZero,
    );
    expect(getProvenanceNode(requireTree(result), ['items', '2'])).toBe(oldOne);
  });

  it.each([
    {
      base: 'not-array',
      kind: 'append-requires-array-pair',
      layer: [],
      strategy: 'append',
    },
    {
      base: [],
      kind: 'append-requires-array-pair',
      layer: { item: true },
      strategy: 'append',
    },
    {
      base: null,
      kind: 'prepend-requires-array-pair',
      layer: [],
      strategy: 'prepend',
    },
    {
      base: [],
      kind: 'prepend-requires-array-pair',
      layer: 'not-array',
      strategy: 'prepend',
    },
  ] as const)(
    '$strategy rejects invalid input types',
    ({ base, kind, layer, strategy }) => {
      const registry = registryWith('defaults', 'override');
      const defaults = applyLayer(
        registry,
        'defaults',
        normalizeLayerNode(base),
      );
      const error = captureMergeError(() =>
        applyLayer(registry, 'override', normalizeLayerNode(layer), defaults, [
          { path: '', strategy },
        ]),
      );

      expect(error.details).toMatchObject({
        kind,
        layerId: requireLayer(registry, 'override').id,
        path: '',
      });
    },
  );

  it('matches escaped rule paths exactly', () => {
    const registry = registryWith('defaults', 'override');
    const defaults = applyLayer(registry, 'defaults', {
      'a.b': { items: ['old'] },
    });
    const result = applyLayer(
      registry,
      'override',
      { 'a.b': { items: ['new'] } },
      defaults,
      [{ path: 'a\\.b.items', strategy: 'append' }],
    );

    expect(result.value).toEqual({
      'a.b': { items: ['old', 'new'] },
    });
  });

  it('rejects an array marker even if normalization is bypassed', () => {
    const registry = registryWith('defaults');
    const invalidLayer = [remove] as unknown as MergeLayerNode;
    const error = captureMergeError(() =>
      applyLayer(registry, 'defaults', invalidLayer),
    );

    expect(error.details).toMatchObject({
      kind: 'remove-in-array',
      operation: 'merge',
      path: '0',
    });
  });

  it('keeps default array behavior as replacement', () => {
    const registry = registryWith('defaults', 'override');
    const defaults = applyLayer(registry, 'defaults', { items: [1, 2] });
    const result = applyLayer(registry, 'override', { items: [3] }, defaults);

    expect(result.value).toEqual({ items: [3] });
    expect(getProvenanceNode(requireTree(result), ['items'])).toMatchObject({
      current: { operation: 'replace' },
    });
    expect(
      getProvenanceNode(requireTree(result), ['items', '1']),
    ).toBeUndefined();
  });
});

describe('remove strategy', () => {
  it('exports one non-global unique marker and normalizes object/root controls', () => {
    expect(typeof remove).toBe('symbol');
    expect(Symbol.keyFor(remove)).toBeUndefined();
    expect(normalizeLayerNode(remove)).toBe(remove);
    expect(normalizeLayerNode({ legacy: remove })).toEqual({ legacy: remove });
    expect(() => normalizeConfigNode(remove)).toThrow(KasaneMergeError);
  });

  it.each([
    { input: [remove], path: '0' },
    { input: { items: [remove] }, path: 'items.0' },
    { input: { items: [{ legacy: remove }] }, path: 'items.0.legacy' },
  ])('rejects remove inside arrays at $path', ({ input, path }) => {
    const error = captureMergeError(() => normalizeLayerNode(input));
    expect(error.details).toMatchObject({
      kind: 'remove-in-array',
      operation: 'normalize',
      path,
    });
  });

  it('removes an existing key before rule lookup and leaves a tombstone', () => {
    const registry = registryWith('defaults', 'override');
    const defaults = applyLayer(registry, 'defaults', {
      legacy: [1, 2],
      retained: true,
    });
    const result = applyLayer(
      registry,
      'override',
      normalizeLayerNode({ legacy: remove }),
      defaults,
      [{ path: 'legacy', strategy: 'append' }],
    );
    const tombstone = getProvenanceNode(requireTree(result), ['legacy']);

    expect(result.value).toEqual({ retained: true });
    expect(tombstone).toMatchObject({
      kind: 'tombstone',
      removal: {
        layerId: requireLayer(registry, 'override').id,
        operation: 'remove',
      },
      state: 'tombstone',
    });
    expect(tombstone).not.toHaveProperty('current');
    expect(tombstone).not.toHaveProperty('value');
    expect(JSON.stringify(result.value)).not.toContain('kasane.remove');
  });

  it('records a missing removal and preserves it through unrelated merges', () => {
    const registry = registryWith('defaults', 'remove', 'unrelated', 'restore');
    const defaults = applyLayer(registry, 'defaults', {});
    const removed = applyLayer(
      registry,
      'remove',
      normalizeLayerNode({ ghost: remove }),
      defaults,
    );
    const tombstone = getProvenanceNode(requireTree(removed), ['ghost']);
    const unrelated = applyLayer(
      registry,
      'unrelated',
      { other: true },
      removed,
    );
    const restored = applyLayer(
      registry,
      'restore',
      { ghost: 'present' },
      unrelated,
    );

    expect(removed.value).toEqual({});
    expect(tombstone?.state).toBe('tombstone');
    expect(getProvenanceNode(requireTree(unrelated), ['ghost'])).toBe(
      tombstone,
    );
    expect(restored.value).toEqual({ ghost: 'present', other: true });
    expect(getProvenanceNode(requireTree(restored), ['ghost'])).toMatchObject({
      kind: 'leaf',
      state: 'value',
    });
  });

  it('supports root removal and deterministic repeated removal', () => {
    const registry = registryWith('defaults', 'first-remove', 'second-remove');
    const defaults = applyLayer(registry, 'defaults', { value: true });
    const first = applyLayer(registry, 'first-remove', remove, defaults);
    const second = applyLayer(registry, 'second-remove', remove, first);

    expect(first.value).toBeUndefined();
    expect(requireTree(first).root).toMatchObject({
      kind: 'tombstone',
      removal: { layerId: requireLayer(registry, 'first-remove').id },
    });
    expect(second.value).toBeUndefined();
    expect(requireTree(second).root).toMatchObject({
      kind: 'tombstone',
      removal: { layerId: requireLayer(registry, 'second-remove').id },
    });
    expect(requireTree(second).root).not.toBe(requireTree(first).root);
    expect(requireTree(second).root?.history).toBeUndefined();
  });

  it('treats the string "remove" as an ordinary value', () => {
    const registry = registryWith('defaults');
    const result = applyLayer(registry, 'defaults', 'remove');
    expect(result.value).toBe('remove');
  });
});

describe('strategy surface', () => {
  it('contains only serializable built-in strategy names', () => {
    const allowed: readonly MergeStrategy[] = [
      'replace',
      'merge',
      'append',
      'prepend',
    ];
    expect(allowed).not.toContain(remove);
    expect(createMergeRuleIndex).toBeTypeOf('function');
  });
});
