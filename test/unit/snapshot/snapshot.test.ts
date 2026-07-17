import { describe, expect, expectTypeOf, it, vi } from 'vitest';

import { KasanePathError } from '../../../src/errors/index.js';
import {
  createMergeRuleIndex,
  mergeConfigNodes,
  remove,
} from '../../../src/merge/index.js';
import type { ConfigNode } from '../../../src/normalize/types.js';
import { createLayerRegistry } from '../../../src/provenance/registry.js';
import type { ProvenanceTree } from '../../../src/provenance/tree.js';
import { REDACTED_VALUE } from '../../../src/secrets/redact.js';
import {
  ConfigSnapshot,
  createConfigSnapshot,
} from '../../../src/snapshot/index.js';

function requireProvenance(
  provenance: ProvenanceTree | undefined,
): ProvenanceTree {
  if (provenance === undefined) throw new Error('Missing fixture provenance');
  return provenance;
}

describe('ConfigSnapshot', () => {
  it('keeps get, has, and require consistent for root, values, and missing paths', () => {
    const snapshot = new ConfigSnapshot({
      'escaped.key': { 'slash\\key': 42 },
      items: ['zero', 'one'],
    });

    expect(snapshot.get('')).toBe(snapshot.value);
    expect(snapshot.has('')).toBe(true);
    expect(snapshot.require('')).toBe(snapshot.value);
    expect(snapshot.get('escaped\\.key.slash\\\\key')).toBe(42);
    expect(snapshot.has('items.1')).toBe(true);
    expect(snapshot.require('items.1')).toBe('one');

    expect(snapshot.get('items.2')).toBeUndefined();
    expect(snapshot.has('items.2')).toBe(false);
    expect(() => snapshot.require('items.2')).toThrow(KasanePathError);
  });

  it.each<ConfigNode>([null, true, 42, 'root', [1, 2], { root: true }])(
    'supports root value %#',
    (root) => {
      const snapshot = new ConfigSnapshot(root);
      expect(snapshot.get('')).toEqual(root);
      expect(snapshot.has('')).toBe(true);
      expect(snapshot.require('')).toEqual(root);
    },
  );

  it('treats an explicitly removed path as absent from the value API', () => {
    const registry = createLayerRegistry([
      { kind: 'value', name: 'defaults' },
      { kind: 'value', name: 'remove' },
    ]);
    const defaults = registry.getLayerByName('defaults');
    const remover = registry.getLayerByName('remove');
    if (defaults === undefined || remover === undefined) {
      throw new Error('Missing fixture layers');
    }
    const first = mergeConfigNodes({
      base: undefined,
      layer: { obsolete: 'legacy', retained: true },
      layerId: defaults.id,
      registry,
      rules: createMergeRuleIndex([]),
    });
    const result = mergeConfigNodes({
      base: first.value,
      baseProvenance: requireProvenance(first.provenance),
      layer: { obsolete: remove },
      layerId: remover.id,
      registry,
      rules: createMergeRuleIndex([]),
    });
    if (result.value === undefined) throw new Error('Missing fixture value');

    const snapshot = createConfigSnapshot(result.value, {
      provenance: requireProvenance(result.provenance),
    });
    expect(snapshot.get('obsolete')).toBeUndefined();
    expect(snapshot.has('obsolete')).toBe(false);
    expect(() => snapshot.require('obsolete')).toThrow(KasanePathError);
    expect(snapshot.toJSON()).toEqual({ retained: true });
  });

  it('isolates and deeply freezes the default raw value', () => {
    const input = { nested: { items: [1, 2] } };
    const snapshot = new ConfigSnapshot(input);

    expect(snapshot.value).not.toBe(input);
    expect(snapshot.value.nested).not.toBe(input.nested);
    expect(Object.isFrozen(snapshot.value)).toBe(true);
    expect(Object.isFrozen(snapshot.value.nested)).toBe(true);
    expect(Object.isFrozen(snapshot.value.nested.items)).toBe(true);
    expect(() => {
      (snapshot.value.nested.items as number[]).push(3);
    }).toThrow(TypeError);
    expect(snapshot.get('nested.items.2')).toBeUndefined();
  });

  it('allows runtime mutation only when freeze is explicitly disabled', () => {
    const input = { nested: { count: 1 } };
    const snapshot = createConfigSnapshot(input, { freeze: false });
    const mutable = snapshot.value as { nested: { count: number } };

    expect(Object.isFrozen(snapshot.value)).toBe(false);
    mutable.nested.count = 2;
    expect(snapshot.get('nested.count')).toBe(2);
    expect(input.nested.count).toBe(1);
  });

  it('returns a detached tree and invokes the redaction hook on a detached input', () => {
    let hookInput: ConfigNode | undefined;
    const redact = vi.fn((value: ConfigNode) => {
      hookInput = value;
      (value as { public: string }).public = 'hooked';
      return value;
    });
    const snapshot = createConfigSnapshot(
      { public: 'original' },
      { redact, freeze: false },
    );

    const json = snapshot.toJSON() as { public: string };
    expect(redact).toHaveBeenCalledOnce();
    expect(hookInput).not.toBe(snapshot.value);
    expect(snapshot.get('public')).toBe('original');
    expect(json).toEqual({ public: 'hooked' });

    json.public = 'mutated output';
    expect(snapshot.toJSON()).toEqual({ public: 'hooked' });
  });

  it('redacts secret leaves by default without hiding public siblings', () => {
    const canary = 'secret-snapshot-canary';
    const registry = createLayerRegistry([
      { kind: 'value', name: 'public' },
      { kind: 'secret', name: 'secret' },
    ]);
    const publicLayer = registry.getLayerByName('public');
    const secretLayer = registry.getLayerByName('secret');
    if (publicLayer === undefined || secretLayer === undefined) {
      throw new Error('Missing fixture layer');
    }
    const first = mergeConfigNodes({
      base: undefined,
      layer: { public: 'visible' },
      layerId: publicLayer.id,
      provenanceMode: 'origin-only',
      registry,
      rules: createMergeRuleIndex([]),
    });
    const result = mergeConfigNodes({
      base: first.value,
      baseProvenance: requireProvenance(first.provenance),
      layer: { token: canary },
      layerId: secretLayer.id,
      provenanceMode: 'origin-only',
      registry,
      rules: createMergeRuleIndex([]),
      secret: true,
    });
    if (result.value === undefined) throw new Error('Missing fixture value');
    const snapshot = createConfigSnapshot(result.value, {
      provenance: requireProvenance(result.provenance),
    });

    const json = snapshot.toJSON();
    expect(JSON.stringify(json)).not.toContain(canary);
    expect(json).toEqual({ public: 'visible', token: REDACTED_VALUE });
  });

  it('does not expose value, provenance, redactor, or cache as public fields', () => {
    const snapshot = new ConfigSnapshot({ answer: 42 });
    expect(Reflect.ownKeys(snapshot)).toEqual([]);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect('provenance' in snapshot).toBe(false);
    expect('cache' in snapshot).toBe(false);
    expectTypeOf(snapshot.value).toEqualTypeOf<
      Readonly<{ readonly answer: number }>
    >();
  });
});
