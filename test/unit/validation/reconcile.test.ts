import { describe, expect, it } from 'vitest';

import { KasaneValidationError, remove } from '../../../src/index.js';
import type { ConfigNode } from '../../../src/normalize/types.js';
import {
  createContainerProvenanceNode,
  createProvenanceTree,
  getNearestTombstone,
  getProvenanceNode,
} from '../../../src/provenance/tree.js';
import type { ProvenanceTree } from '../../../src/provenance/tree.js';
import { reconcileValidationProvenance } from '../../../src/validation/reconcile.js';
import { createProvenanceFixture } from '../builders/provenance.js';

function requireTree(
  output: Readonly<{ provenance: ProvenanceTree | undefined }>,
): ProvenanceTree {
  if (output.provenance === undefined) throw new Error('Missing provenance');
  return output.provenance;
}

function reconcile(
  before: ConfigNode | undefined,
  after: ConfigNode | undefined,
  provenance: ProvenanceTree,
  fingerprintKey?: string,
): ProvenanceTree {
  const fixture = createProvenanceFixture(
    { name: 'input' },
    { kind: 'validation', name: 'validation' },
  );
  // Rebuild the input tree in the registry used by this reconciliation call.
  const input = fixture.apply('input', before, undefined, {
    mode: provenance.mode,
  });
  return reconcileValidationProvenance({
    after,
    before,
    provenance: before === undefined ? provenance : requireTree(input),
    registry: fixture.registry,
    validationLayerId: fixture.layer('validation').id,
    ...(fingerprintKey === undefined ? {} : { fingerprintKey }),
  });
}

describe('validation provenance reconciliation', () => {
  it.each([
    { after: null, expectedKind: 'leaf' },
    { after: true, expectedKind: 'leaf' },
    { after: 1, expectedKind: 'leaf' },
    { after: 'value', expectedKind: 'leaf' },
    { after: [], expectedKind: 'array' },
    { after: {}, expectedKind: 'object' },
    { after: { nested: [1] }, expectedKind: 'object' },
  ] satisfies readonly Readonly<{
    after: ConfigNode;
    expectedKind: string;
  }>[])(
    'assigns an absent root $after to validation as $expectedKind',
    ({ after, expectedKind }) => {
      const tree = reconcile(
        undefined,
        after,
        createProvenanceTree(undefined, 'full'),
      );
      expect(tree.root).toMatchObject({
        current: { operation: 'set' },
        kind: expectedKind,
        state: 'value',
      });
      expect(tree.root?.history).toHaveLength(1);
    },
  );

  it('preserves an absent tree when validation remains absent', () => {
    const tree = createProvenanceTree(undefined, 'origin-only');
    expect(reconcile(undefined, undefined, tree).root).toBeUndefined();
  });

  it('keeps equal values and marks changed leaves as transformed', () => {
    const fixture = createProvenanceFixture(
      { name: 'input' },
      { kind: 'validation', name: 'validation' },
    );
    const input = fixture.apply('input', { answer: 1 }, undefined, {
      mode: 'full',
    });
    const unchanged = reconcileValidationProvenance({
      after: { answer: 1 },
      before: input.value,
      provenance: requireTree(input),
      registry: fixture.registry,
      validationLayerId: fixture.layer('validation').id,
    });
    expect(unchanged.root).toBe(requireTree(input).root);

    const changed = reconcileValidationProvenance({
      after: { answer: 2 },
      before: input.value,
      provenance: requireTree(input),
      registry: fixture.registry,
      validationLayerId: fixture.layer('validation').id,
    });
    expect(getProvenanceNode(changed, ['answer'])).toMatchObject({
      current: { operation: 'set', transformed: true },
      history: [{ kind: 'value' }, { kind: 'value', value: 2 }],
    });
  });

  it.each([
    { after: { value: true }, before: 'leaf', kind: 'object' },
    { after: ['value'], before: 'leaf', kind: 'array' },
    { after: 'leaf', before: { value: true }, kind: 'leaf' },
    { after: ['value'], before: { value: true }, kind: 'array' },
    { after: { value: true }, before: ['leaf'], kind: 'object' },
  ] satisfies readonly Readonly<{
    after: ConfigNode;
    before: ConfigNode;
    kind: string;
  }>[])(
    'reconciles a root kind change into $kind',
    ({ after, before, kind }) => {
      const tree = reconcile(
        before,
        after,
        createProvenanceTree(undefined, 'full'),
      );
      expect(tree.root).toMatchObject({
        current: { transformed: true },
        kind,
      });
    },
  );

  it('retains validation tombstones across container/leaf/container changes', () => {
    const fixture = createProvenanceFixture(
      { name: 'input' },
      { name: 'cleanup' },
      { kind: 'validation', name: 'validation' },
    );
    const input = fixture.apply(
      'input',
      { branch: { present: 1, removed: 2 } },
      undefined,
      { mode: 'full' },
    );
    const cleaned = fixture.apply(
      'cleanup',
      { branch: { ghost: remove } },
      input,
      { mode: 'full' },
    );
    const asLeaf = reconcileValidationProvenance({
      after: { branch: 'leaf' },
      before: cleaned.value,
      provenance: requireTree(cleaned),
      registry: fixture.registry,
      validationLayerId: fixture.layer('validation').id,
    });
    expect(getNearestTombstone(asLeaf, ['branch', 'present'])).toBeDefined();
    expect(getNearestTombstone(asLeaf, ['branch', 'ghost'])).toBeDefined();

    const asContainer = reconcileValidationProvenance({
      after: { branch: { added: true } },
      before: { branch: 'leaf' },
      provenance: asLeaf,
      registry: fixture.registry,
      validationLayerId: fixture.layer('validation').id,
    });
    expect(getProvenanceNode(asContainer, ['branch', 'added'])).toMatchObject({
      current: { operation: 'set' },
    });
    expect(
      getNearestTombstone(asContainer, ['branch', 'present']),
    ).toBeDefined();
  });

  it('adds, removes, transforms, and preserves tombstones within one object', () => {
    const fixture = createProvenanceFixture(
      { name: 'input' },
      { name: 'cleanup' },
      { kind: 'validation', name: 'validation' },
    );
    const input = fixture.apply(
      'input',
      { changed: 1, kept: true, removed: 'old' },
      undefined,
      { mode: 'full' },
    );
    const withTombstone = fixture.apply('cleanup', { ghost: remove }, input, {
      mode: 'full',
    });
    const tree = reconcileValidationProvenance({
      after: { added: 'new', changed: 2, kept: true },
      before: withTombstone.value,
      provenance: requireTree(withTombstone),
      registry: fixture.registry,
      validationLayerId: fixture.layer('validation').id,
    });

    expect(getProvenanceNode(tree, ['kept'])).toBe(
      getProvenanceNode(requireTree(withTombstone), ['kept']),
    );
    expect(getProvenanceNode(tree, ['added'])).toMatchObject({
      current: { layerId: fixture.layer('validation').id, operation: 'set' },
    });
    expect(getProvenanceNode(tree, ['changed'])).toMatchObject({
      current: { transformed: true },
    });
    expect(getNearestTombstone(tree, ['removed'])).toBeDefined();
    expect(getNearestTombstone(tree, ['ghost'])).toBeDefined();
  });

  it('redacts removed secret history and supports a keyed fingerprint', () => {
    const fixture = createProvenanceFixture(
      { kind: 'secret', name: 'secret' },
      { kind: 'validation', name: 'validation' },
    );
    const input = fixture.apply(
      'secret',
      { token: 'fixture-private-value' },
      undefined,
      {
        mode: 'full',
        secret: true,
      },
    );
    const tree = reconcileValidationProvenance({
      after: {},
      before: input.value,
      fingerprintKey: 'fixture-fingerprint-key',
      provenance: requireTree(input),
      registry: fixture.registry,
      validationLayerId: fixture.layer('validation').id,
    });
    const tombstone = getNearestTombstone(tree, ['token']);
    expect(tombstone).toMatchObject({ secret: true, state: 'tombstone' });
    expect(tombstone?.history?.[0]).toMatchObject({
      kind: 'redacted',
      redacted: true,
    });
    expect(JSON.stringify(tombstone)).not.toContain('fixture-private-value');
  });

  it.each([
    {
      kind: 'missing-input-provenance',
      provenance: createProvenanceTree(),
    },
    {
      kind: 'inconsistent-input-provenance',
      provenance: createProvenanceTree,
    },
  ])('rejects $kind deterministically', ({ kind, provenance }) => {
    const fixture = createProvenanceFixture(
      { name: 'input' },
      { kind: 'validation', name: 'validation' },
    );
    const input = fixture.apply('input', [], undefined, {
      mode: 'origin-only',
    });
    const invalid =
      typeof provenance === 'function'
        ? createProvenanceTree(
            createContainerProvenanceNode(
              'object',
              (
                requireTree(input).root as Exclude<
                  NonNullable<ProvenanceTree['root']>,
                  { state: 'tombstone' }
                >
              ).current as never,
            ),
          )
        : provenance;

    let failure: unknown;
    try {
      reconcileValidationProvenance({
        after: [],
        before: [],
        provenance: invalid,
        registry: fixture.registry,
        validationLayerId: fixture.layer('validation').id,
      });
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(KasaneValidationError);
    expect(failure).toMatchObject({
      code: 'KASANE_VALIDATION_ERROR',
      details: { kind, operation: 'reconcile-validation' },
    });
  });
});
