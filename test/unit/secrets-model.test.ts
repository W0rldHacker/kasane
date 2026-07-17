import { describe, expect, it } from 'vitest';

import { KasaneLayerError } from '../../src/errors/index.js';
import {
  createMergeRuleIndex,
  mergeConfigNodes,
  remove,
} from '../../src/merge/index.js';
import type { MergeOutput } from '../../src/merge/index.js';
import { normalizeAnnotatedLayerNode } from '../../src/normalize/index.js';
import { createLayerRegistry } from '../../src/provenance/registry.js';
import type { LayerRegistry } from '../../src/provenance/registry.js';
import { getProvenanceNode } from '../../src/provenance/tree.js';
import type {
  ProvenanceNode,
  ProvenanceTree,
} from '../../src/provenance/tree.js';
import {
  applySecretPathPolicy,
  createSecretPathMatcher,
  secretValue,
} from '../../src/secrets/index.js';

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

function apply(
  registry: LayerRegistry,
  layerName: string,
  input: unknown,
  previous?: MergeOutput,
  options: Readonly<{
    policy?: ReturnType<typeof createSecretPathMatcher>;
    secret?: boolean;
  }> = {},
): MergeOutput {
  const layer = registry.getLayerByName(layerName);
  if (layer === undefined) throw new Error('Missing layer');
  const normalized = normalizeAnnotatedLayerNode(input);
  return mergeConfigNodes({
    base: previous?.value,
    layer: normalized.value,
    layerId: layer.id,
    provenanceMode: 'full',
    registry,
    rules: createMergeRuleIndex([]),
    secret: options.secret ?? false,
    secretPaths: normalized.secretPaths,
    ...(previous?.provenance === undefined
      ? {}
      : { baseProvenance: previous.provenance }),
    ...(options.policy === undefined ? {} : { secretPolicy: options.policy }),
  });
}

describe('secrets model', () => {
  it('matches exact, escaped, and one-segment wildcard subtree policies', () => {
    const matcher = createSecretPathMatcher([
      'integrations.*.token',
      'service\\.internal.credentials',
    ]);

    expect(matcher.matches('integrations.github.token')).toBe(true);
    expect(matcher.matches('integrations.github.token.value')).toBe(true);
    expect(matcher.matches('integrations.github.v2.token')).toBe(false);
    expect(matcher.matches('service\\.internal.credentials.password')).toBe(
      true,
    );
    expect(matcher.matches('service.internal.credentials')).toBe(false);
    let failure: unknown;
    try {
      createSecretPathMatcher(['integrations.**.token']);
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(KasaneLayerError);
    if (!(failure instanceof KasaneLayerError)) {
      throw new Error('Missing secret matcher failure');
    }
    expect(failure.details.kind).toBe('unsupported-recursive-secret-wildcard');
  });

  it('unwraps nested secretValue markers before normalization', () => {
    const canary = 'MARKER_CANARY';
    const marker = secretValue(canary);
    const result = normalizeAnnotatedLayerNode({
      nested: { array: [1, secretValue(marker)], token: marker },
      public: 'visible',
    });

    expect(result.value).toEqual({
      nested: { array: [1, canary], token: canary },
      public: 'visible',
    });
    expect([...result.secretPaths].sort()).toEqual([
      'nested.array.1',
      'nested.token',
    ]);
    expect(Reflect.ownKeys(marker)).toEqual([]);
    expect(JSON.stringify(marker)).not.toContain(canary);
  });

  it('keeps untouched secret descendants while a partial public override clears its own flag', () => {
    const registry = createLayerRegistry([
      { kind: 'secret', name: 'secret' },
      { kind: 'value', name: 'public' },
    ]);
    const initial = apply(
      registry,
      'secret',
      { auth: { label: 'hidden-label', token: 'SECRET_CANARY' } },
      undefined,
      { secret: true },
    );
    const overridden = apply(
      registry,
      'public',
      { auth: { label: 'visible-label' } },
      initial,
    );

    const auth = requireNode(overridden, ['auth']);
    const label = requireNode(overridden, ['auth', 'label']);
    const token = requireNode(overridden, ['auth', 'token']);
    expect(auth.secret).toBe(false);
    expect(label.secret).toBe(false);
    expect(token.secret).toBe(true);
    expect(JSON.stringify(token.history)).not.toContain('SECRET_CANARY');
  });

  it('redacts prior public history on public-to-secret and keeps it redacted after a public override', () => {
    const canary = 'PUBLIC_HISTORY_CANARY';
    const registry = createLayerRegistry([
      { kind: 'value', name: 'first' },
      { kind: 'value', name: 'marked' },
      { kind: 'value', name: 'override' },
    ]);
    const first = apply(registry, 'first', { token: canary });
    const marked = apply(
      registry,
      'marked',
      {
        token: secretValue('SECRET_HISTORY_CANARY'),
      },
      first,
    );
    const secretNode = requireNode(marked, ['token']);

    expect(secretNode.secret).toBe(true);
    expect(secretNode.history?.map((entry) => entry.kind)).toEqual([
      'redacted',
      'redacted',
    ]);
    expect(JSON.stringify(secretNode.history)).not.toContain(canary);

    const overridden = apply(
      registry,
      'override',
      { token: 'public-again' },
      marked,
    );
    const publicNode = requireNode(overridden, ['token']);
    expect(publicNode.secret).toBe(false);
    expect(publicNode.history?.map((entry) => entry.kind)).toEqual([
      'redacted',
      'redacted',
      'value',
    ]);
    expect(JSON.stringify(publicNode.history)).not.toContain(canary);
  });

  it('creates a secret tombstone and removes plaintext history', () => {
    const canary = 'REMOVED_SECRET_CANARY';
    const registry = createLayerRegistry([
      { kind: 'secret', name: 'secret' },
      { kind: 'value', name: 'remove' },
    ]);
    const initial = apply(registry, 'secret', { token: canary }, undefined, {
      secret: true,
    });
    const removed = apply(registry, 'remove', { token: remove }, initial);
    const tombstone = requireNode(removed, ['token']);

    expect(tombstone.state).toBe('tombstone');
    expect(tombstone.secret).toBe(true);
    expect(JSON.stringify(tombstone)).not.toContain(canary);
  });

  it('remaps item-level secretValue annotations through array append', () => {
    const registry = createLayerRegistry([
      { kind: 'value', name: 'base' },
      { kind: 'value', name: 'append' },
    ]);
    const base = apply(registry, 'base', { items: ['public'] });
    const layer = registry.getLayerByName('append');
    if (layer === undefined) throw new Error('Missing append layer');
    const normalized = normalizeAnnotatedLayerNode({
      items: [secretValue('APPENDED_CANARY')],
    });
    const appended = mergeConfigNodes({
      base: base.value,
      baseProvenance: requireTree(base),
      layer: normalized.value,
      layerId: layer.id,
      provenanceMode: 'full',
      registry,
      rules: createMergeRuleIndex([{ path: 'items', strategy: 'append' }]),
      secretPaths: normalized.secretPaths,
    });

    expect(appended.value).toEqual({ items: ['public', 'APPENDED_CANARY'] });
    expect(requireNode(appended, ['items', '0']).secret).toBe(false);
    expect(requireNode(appended, ['items', '1']).secret).toBe(true);
  });

  it('forces wildcard policy on public values and supports a final post-reconciliation pass', () => {
    const canary = 'POLICY_HISTORY_CANARY';
    const registry = createLayerRegistry([{ kind: 'value', name: 'value' }]);
    const publicResult = apply(registry, 'value', {
      integrations: {
        github: { token: canary, visible: 'yes' },
      },
    });
    const matcher = createSecretPathMatcher(['integrations.*.token']);
    const reconciled = applySecretPathPolicy(
      requireTree(publicResult),
      registry,
      matcher,
    );
    const token = getProvenanceNode(reconciled, [
      'integrations',
      'github',
      'token',
    ]);
    const visible = getProvenanceNode(reconciled, [
      'integrations',
      'github',
      'visible',
    ]);

    expect(token?.secret).toBe(true);
    expect(visible?.secret).toBe(false);
    expect(JSON.stringify(token?.history)).not.toContain(canary);
  });
});
