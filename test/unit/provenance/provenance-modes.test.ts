import { describe, expect, it } from 'vitest';

import { KasaneMergeError } from '../../../src/errors/index.js';
import {
  createMergeRuleIndex,
  mergeConfigNodes,
  remove,
} from '../../../src/merge/index.js';
import type {
  MergeLayerNode,
  MergeOutput,
  MergeRule,
  ProvenanceMode,
} from '../../../src/merge/index.js';
import {
  createLeafHistoryEntry,
  redactHistory,
} from '../../../src/provenance/history.js';
import { createOriginRecord } from '../../../src/provenance/origin.js';
import { createLayerRegistry } from '../../../src/provenance/registry.js';
import type {
  LayerRecord,
  LayerRegistry,
} from '../../../src/provenance/registry.js';
import { getProvenanceNode } from '../../../src/provenance/tree.js';
import type {
  ProvenanceNode,
  ProvenanceTree,
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
  provenanceMode?: ProvenanceMode,
  rules: readonly MergeRule[] = [],
  secret = false,
): MergeOutput {
  return mergeConfigNodes({
    base: previous?.value,
    layer,
    layerId: requireLayer(registry, layerName).id,
    registry,
    rules: createMergeRuleIndex(rules),
    secret,
    ...(provenanceMode === undefined ? {} : { provenanceMode }),
    ...(previous?.provenance === undefined
      ? {}
      : { baseProvenance: previous.provenance }),
  });
}

function requireTree(output: MergeOutput): ProvenanceTree {
  if (output.provenance === undefined) throw new Error('Missing provenance');
  return output.provenance;
}

function requireNode(
  output: MergeOutput,
  segments: readonly string[],
): ProvenanceNode {
  const node = getProvenanceNode(requireTree(output), segments);
  if (node === undefined) throw new Error('Missing provenance node');
  return node;
}

function assertNoHistory(node: ProvenanceNode): void {
  expect('history' in node).toBe(false);
  if (node.state === 'value' && node.kind !== 'leaf') {
    for (const child of node.children.values()) assertNoHistory(child);
  }
}

describe('provenance-modes', () => {
  it('produces the same final value in none, origin-only, and full modes', () => {
    const values = (['none', 'origin-only', 'full'] as const).map((mode) => {
      const registry = registryWith('defaults', 'application', 'environment');
      const defaults = applyLayer(
        registry,
        'defaults',
        { items: [1], obsolete: true, service: { port: 8080 } },
        undefined,
        mode,
      );
      const application = applyLayer(
        registry,
        'application',
        { items: [2], service: { host: 'internal' } },
        defaults,
        mode,
        [{ path: 'items', strategy: 'append' }],
      );
      return applyLayer(
        registry,
        'environment',
        { obsolete: remove },
        application,
        mode,
      ).value;
    });

    expect(values[0]).toEqual({
      items: [1, 2],
      service: { host: 'internal', port: 8080 },
    });
    expect(values[1]).toEqual(values[0]);
    expect(values[2]).toEqual(values[0]);
  });

  it('defaults to origin-only and records the mode as snapshot metadata', () => {
    const registry = registryWith('defaults');
    const result = applyLayer(registry, 'defaults', { answer: 42 });
    const tree = requireTree(result);

    expect(result.provenanceMode).toBe('origin-only');
    expect(tree.mode).toBe('origin-only');
    if (tree.root === undefined) throw new Error('Missing root');
    assertNoHistory(tree.root);
  });

  it('shares only path-independent immutable origins within one layer', () => {
    const registry = registryWith('defaults');
    const result = applyLayer(
      registry,
      'defaults',
      { left: 1, right: 2 },
      undefined,
      'full',
    );
    const left = requireNode(result, ['left']);
    const right = requireNode(result, ['right']);
    if (left.state !== 'value' || right.state !== 'value') {
      throw new Error('Expected value provenance');
    }

    expect(left.current).toBe(right.current);
    expect(left.history?.[0]?.origin).toBe(left.current);
    expect(right.history?.[0]?.origin).toBe(right.current);
  });

  it('keeps ordered leaf attempts, including equal replacements, in full mode', () => {
    const registry = registryWith('defaults', 'application', 'environment');
    const defaults = applyLayer(
      registry,
      'defaults',
      { retries: 1 },
      undefined,
      'full',
    );
    const application = applyLayer(
      registry,
      'application',
      { retries: 2 },
      defaults,
      'full',
    );
    const result = applyLayer(
      registry,
      'environment',
      { retries: 2 },
      application,
      'full',
    );
    const node = requireNode(result, ['retries']);

    expect(node.history?.map(({ origin }) => origin.layerId)).toEqual([
      requireLayer(registry, 'defaults').id,
      requireLayer(registry, 'application').id,
      requireLayer(registry, 'environment').id,
    ]);
    expect(node.history?.map(({ origin }) => origin.operation)).toEqual([
      'set',
      'replace',
      'replace',
    ]);
    expect(
      node.history?.map((entry) =>
        entry.kind === 'value' ? entry.value : entry.kind,
      ),
    ).toEqual([1, 2, 2]);
  });

  it('does not add an origin or history entry for an undefined field', () => {
    const registry = registryWith('defaults', 'override');
    const defaults = applyLayer(
      registry,
      'defaults',
      { answer: 42 },
      undefined,
      'full',
    );
    const before = requireNode(defaults, ['answer']);
    const result = applyLayer(
      registry,
      'override',
      { answer: undefined },
      defaults,
      'full',
    );

    expect(requireNode(result, ['answer'])).toBe(before);
    expect(requireNode(result, ['answer']).history).toHaveLength(1);
  });

  it('stores container attempts without redundant value snapshots', () => {
    const registry = registryWith('defaults', 'override');
    const defaults = applyLayer(
      registry,
      'defaults',
      { nested: { left: 1 } },
      undefined,
      'full',
    );
    const result = applyLayer(
      registry,
      'override',
      { nested: { right: 2 } },
      defaults,
      'full',
    );
    const nested = requireNode(result, ['nested']);

    expect(nested.history).toHaveLength(2);
    expect(nested.history?.every((entry) => entry.kind === 'operation')).toBe(
      true,
    );
    expect(nested.history?.every((entry) => !('value' in entry))).toBe(true);
  });

  it('preserves ordered remove history for existing and already missing paths', () => {
    const registry = registryWith('defaults', 'first-remove', 'second-remove');
    const defaults = applyLayer(
      registry,
      'defaults',
      { obsolete: 'legacy' },
      undefined,
      'full',
    );
    const removed = applyLayer(
      registry,
      'first-remove',
      { obsolete: remove },
      defaults,
      'full',
    );
    const result = applyLayer(
      registry,
      'second-remove',
      { obsolete: remove },
      removed,
      'full',
    );
    const tombstone = requireNode(result, ['obsolete']);

    expect(result.value).toEqual({});
    expect(tombstone.state).toBe('tombstone');
    expect(tombstone.history?.map(({ origin }) => origin.operation)).toEqual([
      'set',
      'remove',
      'remove',
    ]);
    expect(tombstone.history?.at(-1)?.origin.layerId).toBe(
      requireLayer(registry, 'second-remove').id,
    );
  });

  it('does not create a hidden tree in none mode', () => {
    const registry = registryWith('defaults');
    const result = applyLayer(
      registry,
      'defaults',
      { answer: 42 },
      undefined,
      'none',
    );

    expect(result).toMatchObject({
      provenance: undefined,
      provenanceMode: 'none',
      value: { answer: 42 },
    });
  });

  it('cleans replaced descendants while retaining exact-path history', () => {
    const registry = registryWith('defaults', 'override');
    const defaults = applyLayer(
      registry,
      'defaults',
      { service: { host: 'localhost', port: 8080 } },
      undefined,
      'full',
    );
    const result = applyLayer(
      registry,
      'override',
      { service: { host: 'internal' } },
      defaults,
      'full',
      [{ path: 'service', strategy: 'replace' }],
    );
    const service = requireNode(result, ['service']);
    const host = requireNode(result, ['service', 'host']);

    expect(
      getProvenanceNode(requireTree(result), ['service', 'port']),
    ).toBeUndefined();
    expect(service.history?.map(({ origin }) => origin.layerId)).toEqual([
      requireLayer(registry, 'defaults').id,
      requireLayer(registry, 'override').id,
    ]);
    expect(host.history?.map(({ origin }) => origin.layerId)).toEqual([
      requireLayer(registry, 'override').id,
    ]);
  });

  it('redacts secret leaf attempts and can erase earlier detached plaintext', () => {
    const canary = 'secret-history-canary';
    const registry = registryWith('secret');
    const result = applyLayer(
      registry,
      'secret',
      { token: canary },
      undefined,
      'full',
      [],
      true,
    );
    const token = requireNode(result, ['token']);

    expect(token.history).toMatchObject([{ kind: 'redacted', redacted: true }]);
    expect(JSON.stringify(token.history)).not.toContain(canary);

    const publicOrigin = createOriginRecord(
      registry,
      requireLayer(registry, 'secret').id,
      { operation: 'set', scope: 'leaf', secret: false },
    );
    const publicHistory = [
      createLeafHistoryEntry(publicOrigin, canary, () => 'v1:sha256:unused'),
    ];
    const redacted = redactHistory(
      publicHistory,
      () => 'v1:sha256:fixture-fingerprint',
    );

    expect(JSON.stringify(redacted)).not.toContain(canary);
    expect(redacted).toMatchObject([
      { fingerprint: 'v1:sha256:fixture-fingerprint', kind: 'redacted' },
    ]);
    expect(redacted).toMatchObject([{ kind: 'redacted', redacted: true }]);
  });

  it('rejects continuing a stored tree under a different mode', () => {
    const registry = registryWith('defaults', 'override');
    const defaults = applyLayer(
      registry,
      'defaults',
      { answer: 1 },
      undefined,
      'origin-only',
    );

    expect(() =>
      applyLayer(registry, 'override', { answer: 2 }, defaults, 'full'),
    ).toThrow(KasaneMergeError);
  });
});
