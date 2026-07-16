import { describe, expect, it } from 'vitest';

import * as publicApi from '../../../src/index.js';
import { KasaneLayerError } from '../../../src/errors/index.js';
import {
  createOriginRecord,
  resolveOriginRecord,
} from '../../../src/provenance/origin.js';
import { createLayerRegistry } from '../../../src/provenance/registry.js';
import {
  createContainerProvenanceNode,
  createLeafProvenanceNode,
  createProvenanceTree,
  createTombstoneProvenanceNode,
  getNearestTombstone,
  getProvenanceNode,
} from '../../../src/provenance/tree.js';

function requireLayer(
  registry: ReturnType<typeof createLayerRegistry>,
  name: string,
) {
  const layer = registry.getLayerByName(name);
  if (layer === undefined) throw new Error(`Missing test layer: ${name}`);
  return layer;
}

function captureLayerError(action: () => unknown): KasaneLayerError {
  try {
    action();
  } catch (error: unknown) {
    if (error instanceof KasaneLayerError) return error;
    throw error;
  }
  throw new Error('Expected a KasaneLayerError');
}

describe('provenance-tree registry and origins', () => {
  it('represents a mixed-origin object without repeating layer strings', () => {
    const registry = createLayerRegistry([
      { name: 'defaults', kind: 'value' },
      {
        name: 'environment',
        kind: 'env',
        source: { inputReferences: ['DATABASE_HOST'] },
      },
    ]);
    const defaults = requireLayer(registry, 'defaults');
    const environment = requireLayer(registry, 'environment');
    const environmentReference = registry.getReferenceId('DATABASE_HOST');
    if (environmentReference === undefined) {
      throw new Error('Missing test source reference');
    }

    const rootOrigin = createOriginRecord(registry, environment.id, {
      operation: 'merge',
      scope: 'container',
      secret: false,
    });
    const portOrigin = createOriginRecord(registry, defaults.id, {
      operation: 'set',
      scope: 'leaf',
      secret: false,
    });
    const hostOrigin = createOriginRecord(registry, environment.id, {
      inputReferenceId: environmentReference,
      operation: 'replace',
      scope: 'leaf',
      secret: false,
    });
    const tree = createProvenanceTree(
      createContainerProvenanceNode('object', rootOrigin, [
        ['port', createLeafProvenanceNode(portOrigin)],
        ['host', createLeafProvenanceNode(hostOrigin)],
        ['__proto__', createLeafProvenanceNode(hostOrigin)],
      ]),
    );

    expect(getProvenanceNode(tree, ['port'])?.state).toBe('value');
    expect(getProvenanceNode(tree, ['host'])).toMatchObject({
      current: { layerId: environment.id },
    });
    expect(getProvenanceNode(tree, ['__proto__'])).toBeDefined();
    const children =
      tree.root?.state === 'value' && tree.root.kind !== 'leaf'
        ? tree.root.children
        : undefined;
    expect(children).toBeDefined();
    expect(Object.getPrototypeOf(children)).not.toBe(Object.prototype);
    expect(JSON.stringify(tree)).not.toContain('defaults');
    expect(JSON.stringify(tree)).not.toContain('environment');
    expect(JSON.stringify(tree)).not.toContain('DATABASE_HOST');

    expect(resolveOriginRecord(registry, hostOrigin)).toMatchObject({
      inputReference: 'DATABASE_HOST',
      layer: environment,
    });
  });

  it('represents removal as a value-less tombstone and finds an ancestor', () => {
    const registry = createLayerRegistry([
      { name: 'environment', kind: 'env' },
    ]);
    const layer = requireLayer(registry, 'environment');
    const removal = createOriginRecord(registry, layer.id, {
      operation: 'remove',
      scope: 'tombstone',
      secret: true,
    });
    const structural = createOriginRecord(registry, layer.id, {
      operation: 'merge',
      scope: 'container',
      secret: false,
    });
    const tombstone = createTombstoneProvenanceNode(removal);
    const tree = createProvenanceTree(
      createContainerProvenanceNode('object', structural, [
        ['credentials', tombstone],
      ]),
    );

    expect(tombstone).toEqual({
      kind: 'tombstone',
      removal,
      secret: true,
      state: 'tombstone',
    });
    expect(tombstone).not.toHaveProperty('current');
    expect(tombstone).not.toHaveProperty('value');
    expect(getNearestTombstone(tree, ['credentials', 'password'])).toBe(
      tombstone,
    );
  });

  it('lets an array replacement discard old index provenance', () => {
    const registry = createLayerRegistry([
      { name: 'defaults', kind: 'value' },
      { name: 'deployment', kind: 'file' },
    ]);
    const defaults = requireLayer(registry, 'defaults');
    const deployment = requireLayer(registry, 'deployment');
    const oldOrigin = createOriginRecord(registry, defaults.id, {
      operation: 'set',
      scope: 'leaf',
      secret: false,
    });
    const oldContainer = createOriginRecord(registry, defaults.id, {
      operation: 'set',
      scope: 'container',
      secret: false,
    });
    const replacement = createOriginRecord(registry, deployment.id, {
      operation: 'replace',
      scope: 'container',
      secret: false,
    });
    const replacementItem = createOriginRecord(registry, deployment.id, {
      operation: 'replace',
      scope: 'leaf',
      secret: false,
    });

    const oldTree = createProvenanceTree(
      createContainerProvenanceNode('array', oldContainer, [
        ['0', createLeafProvenanceNode(oldOrigin)],
        ['1', createLeafProvenanceNode(oldOrigin)],
      ]),
    );
    const replacedTree = createProvenanceTree(
      createContainerProvenanceNode('array', replacement, [
        ['0', createLeafProvenanceNode(replacementItem)],
      ]),
    );

    expect(getProvenanceNode(oldTree, ['1'])).toBeDefined();
    expect(getProvenanceNode(replacedTree, ['1'])).toBeUndefined();
    expect(getProvenanceNode(replacedTree, ['0'])).toMatchObject({
      current: { layerId: deployment.id, operation: 'replace' },
    });
  });

  it('scopes numeric layer IDs to their registry', () => {
    const first = createLayerRegistry([{ name: 'first', kind: 'value' }]);
    const second = createLayerRegistry([{ name: 'second', kind: 'value' }]);
    const firstLayer = requireLayer(first, 'first');
    const secondLayer = requireLayer(second, 'second');
    const origin = createOriginRecord(first, firstLayer.id, {
      operation: 'set',
      scope: 'leaf',
      secret: false,
    });

    expect(firstLayer.id).toBe(0);
    expect(secondLayer.id).toBe(0);
    const error = captureLayerError(() => resolveOriginRecord(second, origin));
    expect(error.code).toBe('KASANE_LAYER_ERROR');
    expect(error.details.kind).toBe('foreign-layer-id');
  });

  it('rejects a duplicate layer name before constructing a registry', () => {
    const error = captureLayerError(() =>
      createLayerRegistry([
        { name: 'settings', kind: 'value' },
        { name: 'settings', kind: 'env' },
      ]),
    );
    expect(error.code).toBe('KASANE_LAYER_ERROR');
    expect(error.details.kind).toBe('duplicate-layer-name');
  });

  it('supports an origin with no input or layer source reference', () => {
    const registry = createLayerRegistry([
      { name: 'validation', kind: 'validation' },
    ]);
    const layer = requireLayer(registry, 'validation');
    const origin = createOriginRecord(registry, layer.id, {
      operation: 'set',
      scope: 'leaf',
      secret: false,
    });

    expect(origin).not.toHaveProperty('inputReferenceId');
    expect(resolveOriginRecord(registry, origin)).toEqual({
      layer,
      operation: 'set',
      scope: 'leaf',
      secret: false,
    });
  });

  it('deduplicates safe references and never stores configuration plaintext', () => {
    const configCanary = 'CONFIG_PLAINTEXT_CANARY';
    const registration = {
      kind: 'env',
      name: 'environment',
      source: {
        inputReferences: ['DATABASE_URL', 'DATABASE_URL'],
        reference: 'process-env',
        value: configCanary,
      },
      value: configCanary,
    } as const;
    const registry = createLayerRegistry([registration]);
    const layer = requireLayer(registry, 'environment');
    const reference = registry.getReferenceId('DATABASE_URL');
    if (reference === undefined) throw new Error('Missing test reference');
    const originInput = {
      inputReferenceId: reference,
      operation: 'set',
      scope: 'leaf',
      secret: true,
      value: configCanary,
    } as const;
    const origin = createOriginRecord(registry, layer.id, originInput);
    const tree = createProvenanceTree(createLeafProvenanceNode(origin));

    expect(registry.referenceCount).toBe(2);
    expect(origin).toEqual({
      inputReferenceId: reference,
      layerId: layer.id,
      operation: 'set',
      scope: 'leaf',
      secret: true,
    });
    expect(JSON.stringify({ registry, tree })).not.toContain(configCanary);
  });

  it('keeps provenance constructors out of the public entry point', () => {
    expect(publicApi).not.toHaveProperty('createLayerRegistry');
    expect(publicApi).not.toHaveProperty('createOriginRecord');
    expect(publicApi).not.toHaveProperty('createProvenanceTree');
  });
});
