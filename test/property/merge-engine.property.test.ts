import assert from 'node:assert/strict';

import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { kasane, value } from '../../src/index.js';
import type {
  ConfigSnapshot,
  Origin,
  ProvenanceMode,
} from '../../src/index.js';
import {
  defaultMergeCaseArbitrary,
  provenanceModeArbitrary,
  repeatedLayerNameArbitrary,
  ruledMergeCaseArbitrary,
} from './support/generators.js';
import {
  PROPERTY_PROFILE,
  profileRuns,
  runProperty,
} from './support/property-runner.js';
import { interpretMerge } from './support/reference-model.js';
import type {
  ReferenceNode,
  ReferenceOrigin,
  ReferenceValue,
} from './support/reference-model.js';
import { encodeFixture, fixtureDigest } from './support/types.js';
import type { GeneratedMergeCase } from './support/types.js';

const DEFAULT_CASES = 6_000;
const RULED_CASES = 4_000;
const PREFLIGHT_CASES = 100;
const PROPERTY_TIMEOUT = 10 * 60_000;

function expectedOrigin(
  reference: ReferenceOrigin,
  node: ReferenceNode,
): Origin {
  return {
    layer: {
      id: reference.layerIndex,
      kind: 'value',
      name: reference.layerName,
    },
    operation: reference.operation,
    scope:
      node.state === 'tombstone'
        ? 'tombstone'
        : node.type === 'leaf'
          ? 'leaf'
          : 'container',
    secret: false,
  };
}

function assertCurrentOrigin(
  snapshot: ConfigSnapshot,
  mode: ProvenanceMode,
  path: string,
  node: ReferenceValue,
): void {
  const actual = snapshot.origin(path);
  if (mode === 'none') {
    assert.equal(actual, undefined);
    return;
  }
  assert.deepEqual(actual, expectedOrigin(node.origin, node));
}

function assertSnapshotMatchesReference(
  snapshot: ConfigSnapshot,
  mode: ProvenanceMode,
  fixture: GeneratedMergeCase,
): void {
  const reference = interpretMerge(fixture);
  assert.deepEqual(snapshot.value, reference.value);
  assert.deepEqual(
    encodeFixture(snapshot.toJSON()),
    encodeFixture(reference.value),
  );

  for (const entry of reference.entries) {
    assert.equal(snapshot.has(entry.path), true, `missing path ${entry.path}`);
    assert.deepEqual(snapshot.get(entry.path), entry.value);
    assertCurrentOrigin(snapshot, mode, entry.path, entry.node);

    const explanation = snapshot.explain(entry.path);
    assert.equal(explanation.found, true);
    assert.deepEqual(
      encodeFixture(explanation.value),
      encodeFixture(entry.value),
    );
    assert.equal(explanation.path, entry.path);
    assert.deepEqual(
      explanation.origin,
      mode === 'none'
        ? undefined
        : expectedOrigin(entry.node.origin, entry.node),
    );
    if (mode === 'full') assert.ok(explanation.history !== undefined);
    else assert.equal(explanation.history, undefined);
  }

  for (const removal of reference.removals) {
    assert.equal(snapshot.has(removal.path), false);
    assert.equal(snapshot.get(removal.path), undefined);
    assert.equal(snapshot.origin(removal.path), undefined);
    const explanation = snapshot.explain(removal.path);
    assert.equal(explanation.found, false);
    assert.deepEqual(
      explanation.removal,
      mode === 'none'
        ? undefined
        : expectedOrigin(removal.node.origin, removal.node),
    );
  }
}

async function buildSnapshot(
  fixture: GeneratedMergeCase,
  mode: ProvenanceMode,
): Promise<ConfigSnapshot> {
  return kasane({
    layers: fixture.layers.map((layer) => value(layer.name, layer.value)),
    merge: fixture.rules,
    provenance: mode,
  });
}

async function assertMergeCase(
  fixture: GeneratedMergeCase,
  mode: ProvenanceMode,
): Promise<void> {
  // Interpret the ordered layer sequence directly. Append, prepend, and remove
  // are deliberately not subjected to a false associativity assertion.
  const inputBefore = fixtureDigest(fixture);
  const first = await buildSnapshot(fixture, mode);
  const second = await buildSnapshot(fixture, mode);

  assert.equal(fixtureDigest(fixture), inputBefore, 'merge mutated its inputs');
  assert.deepEqual(
    first.value,
    second.value,
    'merge output is non-deterministic',
  );
  assertSnapshotMatchesReference(first, mode, fixture);
  assertSnapshotMatchesReference(second, mode, fixture);

  const reference = interpretMerge(fixture);
  for (const entry of reference.entries) {
    assert.deepEqual(first.origin(entry.path), second.origin(entry.path));
    assert.deepEqual(first.explain(entry.path), second.explain(entry.path));
  }
}

describe('merge engine properties', () => {
  it('allocates at least the required cases for the selected profile', () => {
    const total =
      profileRuns(DEFAULT_CASES) +
      profileRuns(RULED_CASES) +
      profileRuns(PREFLIGHT_CASES);
    expect(total).toBeGreaterThanOrEqual(
      PROPERTY_PROFILE === 'nightly' ? 100_000 : 10_000,
    );
  });

  it(
    'matches the reference model for random nested control-state layers',
    { timeout: PROPERTY_TIMEOUT },
    async () => {
      await runProperty(
        'default-merge-reference',
        fc.asyncProperty(
          defaultMergeCaseArbitrary,
          provenanceModeArbitrary,
          assertMergeCase,
        ),
        DEFAULT_CASES,
      );
    },
  );

  it(
    'matches the reference model for exact replace/merge/append/prepend rules',
    { timeout: PROPERTY_TIMEOUT },
    async () => {
      await runProperty(
        'ruled-merge-reference',
        fc.asyncProperty(
          ruledMergeCaseArbitrary,
          provenanceModeArbitrary,
          assertMergeCase,
        ),
        RULED_CASES,
      );
    },
  );

  it(
    'rejects repeated generated layer names at the public boundary',
    { timeout: PROPERTY_TIMEOUT },
    async () => {
      await runProperty(
        'duplicate-layer-preflight',
        fc.asyncProperty(
          repeatedLayerNameArbitrary,
          async ({ name, value: input }) => {
            await assert.rejects(
              kasane({
                layers: [value(name, input), value(name, { override: true })],
              }),
              (error: unknown) => {
                const failure = error as {
                  code?: unknown;
                  details?: { kind?: unknown; layerName?: unknown };
                };
                assert.equal(failure.code, 'KASANE_LAYER_ERROR');
                assert.ok(failure.details !== undefined);
                assert.equal(failure.details.kind, 'duplicate-layer-name');
                assert.equal(failure.details.layerName, name);
                return true;
              },
            );
          },
        ),
        PREFLIGHT_CASES,
      );
    },
  );
});
