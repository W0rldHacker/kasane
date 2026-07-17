import { describe, expect, it } from 'vitest';

import { KasaneMergeError } from '../../../src/errors/index.js';
import {
  createMergeRuleIndex,
  mergeConfigNodes,
} from '../../../src/merge/index.js';
import type {
  MergeOutput,
  MergeRule,
  ProvenanceMode,
} from '../../../src/merge/index.js';
import { normalizeConfigNode } from '../../../src/normalize/index.js';
import type {
  ConfigArray,
  ConfigNode,
  ConfigObject,
} from '../../../src/normalize/types.js';
import { createLayerRegistry } from '../../../src/provenance/registry.js';
import type {
  LayerRecord,
  LayerRegistry,
} from '../../../src/provenance/registry.js';
import { resolveOriginRecord } from '../../../src/provenance/origin.js';
import {
  getProvenanceNode,
  type ProvenanceTree,
} from '../../../src/provenance/tree.js';

const registrations = [
  { kind: 'value', name: 'defaults' },
  { kind: 'env', name: 'environment' },
] as const;

function requireLayer(registry: LayerRegistry, name: string): LayerRecord {
  const layer = registry.getLayerByName(name);
  if (layer === undefined) throw new Error(`Missing test layer: ${name}`);
  return layer;
}

function canonical(input: unknown): ConfigNode | undefined {
  return normalizeConfigNode(input);
}

function requireValue(output: MergeOutput): ConfigNode {
  if (output.value === undefined) throw new Error('Expected a merge value');
  return output.value;
}

function requireObject(value: ConfigNode | undefined): ConfigObject {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Expected a config object');
  }
  return value;
}

function requireArray(value: ConfigNode | undefined): ConfigArray {
  if (!Array.isArray(value)) throw new Error('Expected a config array');
  return value;
}

function requireProvenance(output: MergeOutput): ProvenanceTree {
  if (output.provenance === undefined) {
    throw new Error('Expected provenance');
  }
  return output.provenance;
}

function applyLayer(
  registry: LayerRegistry,
  layerName: string,
  layer: ConfigNode | undefined,
  previous?: MergeOutput,
  rules: readonly MergeRule[] = [],
  provenanceMode: ProvenanceMode = 'origin-only',
): MergeOutput {
  const registered = requireLayer(registry, layerName);
  return mergeConfigNodes({
    base: previous?.value,
    layer,
    layerId: registered.id,
    provenanceMode,
    registry,
    rules: createMergeRuleIndex(rules),
    ...(previous?.provenance === undefined
      ? {}
      : { baseProvenance: previous.provenance }),
  });
}

function captureMergeError(action: () => unknown): KasaneMergeError {
  try {
    action();
  } catch (error: unknown) {
    if (error instanceof KasaneMergeError) return error;
    throw error;
  }
  throw new Error('Expected a KasaneMergeError');
}

function nestedValue(depth: number, leaf: number): ConfigNode {
  let value: ConfigNode = leaf;
  for (let index = 0; index < depth; index += 1) {
    value = { child: value };
  }
  return value;
}

function deepFreeze(value: ConfigNode): ConfigNode {
  if (value !== null && typeof value === 'object') {
    for (const child of Array.isArray(value) ? value : Object.values(value)) {
      deepFreeze(child);
    }
    Object.freeze(value);
  }
  return value;
}

describe('merge-core', () => {
  it('recursively merges objects and preserves mixed leaf origins', () => {
    const registry = createLayerRegistry(registrations);
    const defaults = applyLayer(
      registry,
      'defaults',
      canonical({
        database: { host: 'localhost', port: 5432 },
        feature: false,
      }),
    );
    const result = applyLayer(
      registry,
      'environment',
      canonical({ database: { host: 'db.internal' }, feature: true }),
      defaults,
    );
    const provenance = requireProvenance(result);

    expect(result.value).toEqual({
      database: { host: 'db.internal', port: 5432 },
      feature: true,
    });
    expect(getProvenanceNode(provenance, ['database'])).toMatchObject({
      current: {
        layerId: requireLayer(registry, 'environment').id,
        operation: 'merge',
      },
      kind: 'object',
    });
    expect(getProvenanceNode(provenance, ['database', 'host'])).toMatchObject({
      current: { layerId: requireLayer(registry, 'environment').id },
    });
    expect(getProvenanceNode(provenance, ['database', 'port'])).toMatchObject({
      current: { layerId: requireLayer(registry, 'defaults').id },
    });
  });

  it('applies exact replace to a whole subtree without consulting children', () => {
    const registry = createLayerRegistry(registrations);
    const defaults = applyLayer(
      registry,
      'defaults',
      canonical({ service: { host: 'localhost', port: 8080 } }),
    );
    const result = applyLayer(
      registry,
      'environment',
      canonical({ service: { host: 'service.internal' } }),
      defaults,
      [
        { path: 'service', strategy: 'replace' },
        { path: 'service.host', strategy: 'merge' },
      ],
    );
    const provenance = requireProvenance(result);

    expect(result.value).toEqual({ service: { host: 'service.internal' } });
    expect(getProvenanceNode(provenance, ['service', 'port'])).toBeUndefined();
    expect(getProvenanceNode(provenance, ['service'])).toMatchObject({
      current: {
        layerId: requireLayer(registry, 'environment').id,
        operation: 'replace',
      },
    });
  });

  it.each([
    {
      base: { value: { old: true } },
      expected: { value: 'new' },
      label: 'object to primitive',
      layer: { value: 'new' },
      path: ['value'],
    },
    {
      base: { value: [1, 2, 3] },
      expected: { value: [4] },
      label: 'array replacement',
      layer: { value: [4] },
      path: ['value', '0'],
    },
    {
      base: { value: { old: true } },
      expected: { value: null },
      label: 'null replacement',
      layer: { value: null },
      path: ['value'],
    },
  ])('performs atomic $label', ({ base, expected, label, layer, path }) => {
    const registry = createLayerRegistry(registrations);
    const defaults = applyLayer(registry, 'defaults', canonical(base));
    const result = applyLayer(
      registry,
      'environment',
      canonical(layer),
      defaults,
    );
    const provenance = requireProvenance(result);

    expect(result.value).toEqual(expected);
    expect(getProvenanceNode(provenance, path)).toMatchObject({
      current: {
        layerId: requireLayer(registry, 'environment').id,
        operation: 'replace',
      },
    });
    if (label === 'array replacement') {
      expect(getProvenanceNode(provenance, ['value'])).toMatchObject({
        current: {
          layerId: requireLayer(registry, 'environment').id,
          operation: 'replace',
        },
        kind: 'array',
      });
      expect(getProvenanceNode(provenance, ['value', '1'])).toBeUndefined();
    }
    if (path.length === 1) {
      const replaced = getProvenanceNode(provenance, path);
      expect(replaced?.state).toBe('value');
      expect(replaced?.kind).toBe('leaf');
    }
  });

  it('treats normalized undefined fields and an undefined layer as no-ops', () => {
    const registry = createLayerRegistry(registrations);
    const defaults = applyLayer(
      registry,
      'defaults',
      canonical({ keep: { nested: true } }),
    );
    const keepBefore = getProvenanceNode(requireProvenance(defaults), ['keep']);
    const normalizedLayer = canonical({ add: 2, keep: undefined });
    const merged = applyLayer(
      registry,
      'environment',
      normalizedLayer,
      defaults,
    );
    const noOp = applyLayer(registry, 'environment', undefined, merged);

    expect(merged.value).toEqual({ add: 2, keep: { nested: true } });
    expect(getProvenanceNode(requireProvenance(merged), ['keep'])).toBe(
      keepBefore,
    );
    expect(requireProvenance(noOp).root).toBe(requireProvenance(merged).root);
    expect(getProvenanceNode(requireProvenance(noOp), ['keep'])?.history).toBe(
      undefined,
    );
  });

  it('detaches shared references and does not mutate frozen inputs', () => {
    const registry = createLayerRegistry(registrations);
    const shared: ConfigObject = { nested: { value: 1 } };
    const baseInput: ConfigNode = { left: shared, right: shared };
    deepFreeze(baseInput);
    const before = JSON.stringify(baseInput);

    const defaults = applyLayer(registry, 'defaults', baseInput);
    const frozenLayer = canonical({ added: { value: 2 } });
    if (frozenLayer === undefined) throw new Error('Missing test layer');
    deepFreeze(frozenLayer);
    const layerBefore = JSON.stringify(frozenLayer);
    const result = applyLayer(registry, 'environment', frozenLayer, defaults);
    const output = requireObject(result.value);
    const left = requireObject(output['left']);
    const right = requireObject(output['right']);

    expect(JSON.stringify(baseInput)).toBe(before);
    expect(JSON.stringify(frozenLayer)).toBe(layerBefore);
    expect(output).not.toBe(baseInput);
    expect(left).not.toBe(right);
    expect(left).not.toBe(requireObject(baseInput)['left']);
    expect(output['added']).not.toBe(requireObject(frozenLayer)['added']);
  });

  it('is deterministic for identical runs and supports the depth boundary', () => {
    const registry = createLayerRegistry(registrations);
    const base = normalizeConfigNode(nestedValue(64, 1), { maxDepth: 64 });
    const layer = normalizeConfigNode(nestedValue(64, 2), { maxDepth: 64 });

    const run = (): MergeOutput => {
      const defaults = applyLayer(registry, 'defaults', base);
      return applyLayer(registry, 'environment', layer, defaults);
    };
    const first = run();
    const second = run();
    const path = Array.from({ length: 64 }, () => 'child');

    expect(first.value).toEqual(second.value);
    expect(JSON.stringify(first.provenance)).toBe(
      JSON.stringify(second.provenance),
    );
    expect(getProvenanceNode(requireProvenance(first), path)).toMatchObject({
      current: { layerId: requireLayer(registry, 'environment').id },
      kind: 'leaf',
    });
  });

  it('does not allocate a hidden tree in none mode', () => {
    const registry = createLayerRegistry(registrations);
    const withProvenance = applyLayer(
      registry,
      'defaults',
      canonical({ value: [1, 2] }),
    );
    const withoutProvenance = applyLayer(
      registry,
      'defaults',
      canonical({ value: [1, 2] }),
      undefined,
      [],
      'none',
    );

    expect(withoutProvenance.value).toEqual(withProvenance.value);
    expect(withoutProvenance.provenance).toBeUndefined();
    expect(
      requireArray(requireObject(requireValue(withoutProvenance))['value']),
    ).toEqual([1, 2]);
  });

  it('reports safe path and layer ID without retaining values on error', () => {
    const registry = createLayerRegistry(registrations);
    const defaults = applyLayer(
      registry,
      'defaults',
      canonical({ service: 'BASE_VALUE_CANARY' }),
    );
    const error = captureMergeError(() =>
      applyLayer(
        registry,
        'environment',
        canonical({ service: 'LAYER_VALUE_CANARY' }),
        defaults,
        [{ path: 'service', strategy: 'merge' }],
      ),
    );

    expect(error.details).toMatchObject({
      kind: 'merge-requires-object-pair',
      layerId: requireLayer(registry, 'environment').id,
      operation: 'merge',
      path: 'service',
    });
    expect(JSON.stringify(error)).not.toContain('BASE_VALUE_CANARY');
    expect(JSON.stringify(error)).not.toContain('LAYER_VALUE_CANARY');
    expect(defaults.value).toEqual({ service: 'BASE_VALUE_CANARY' });
  });

  it('requires provenance for an existing base in enabled modes', () => {
    const registry = createLayerRegistry(registrations);
    const layer = requireLayer(registry, 'environment');
    const error = captureMergeError(() =>
      mergeConfigNodes({
        base: canonical({ existing: true }),
        layer: canonical({ next: true }),
        layerId: layer.id,
        provenanceMode: 'origin-only',
        registry,
        rules: createMergeRuleIndex([]),
      }),
    );

    expect(error.details.kind).toBe('missing-base-provenance');
    expect(error.details.layerId).toBe(layer.id);
  });

  it('returns an empty enabled tree for two absent roots', () => {
    const registry = createLayerRegistry(registrations);
    const result = applyLayer(registry, 'defaults', undefined);

    expect(result.value).toBeUndefined();
    expect(requireProvenance(result).root).toBeUndefined();
  });

  it('assigns path-specific input references to every incoming leaf', () => {
    const registry = createLayerRegistry([
      {
        kind: 'env',
        name: 'environment',
        source: { inputReferences: ['APP_FEATURE', 'APP_SERVER__PORT'] },
      },
    ]);
    const layer = requireLayer(registry, 'environment');
    const feature = registry.getReferenceId('APP_FEATURE');
    const port = registry.getReferenceId('APP_SERVER__PORT');
    if (feature === undefined || port === undefined) {
      throw new Error('Missing input reference fixture');
    }

    const result = mergeConfigNodes({
      base: undefined,
      inputReferenceIds: new Map([
        ['feature', feature],
        ['server.port', port],
      ]),
      layer: canonical({
        feature: { enabled: true, mode: 'safe' },
        server: { port: 8080 },
      }),
      layerId: layer.id,
      registry,
      rules: createMergeRuleIndex([]),
    });
    const provenance = requireProvenance(result);
    const enabled = getProvenanceNode(provenance, ['feature', 'enabled']);
    const mode = getProvenanceNode(provenance, ['feature', 'mode']);
    const portNode = getProvenanceNode(provenance, ['server', 'port']);
    if (
      enabled?.state !== 'value' ||
      mode?.state !== 'value' ||
      portNode?.state !== 'value'
    ) {
      throw new Error('Missing leaf provenance fixture');
    }

    expect(resolveOriginRecord(registry, enabled.current).inputReference).toBe(
      'APP_FEATURE',
    );
    expect(resolveOriginRecord(registry, mode.current).inputReference).toBe(
      'APP_FEATURE',
    );
    expect(resolveOriginRecord(registry, portNode.current).inputReference).toBe(
      'APP_SERVER__PORT',
    );
  });
});
