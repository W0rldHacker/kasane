import { describe, expect, it } from 'vitest';

import { createOriginRecord } from '../../../src/provenance/origin.js';
import { createLayerRegistry } from '../../../src/provenance/registry.js';
import {
  createContainerProvenanceNode,
  createLeafProvenanceNode,
  createProvenanceTree,
  createTombstoneProvenanceNode,
  getNearestTombstone,
  getProvenanceNode,
} from '../../../src/provenance/tree.js';
import { createSecretPathMatcher } from '../../../src/secrets/matcher.js';
import { applySecretPathPolicy } from '../../../src/secrets/policy.js';

describe('final secret path policy pass', () => {
  it('marks leaf, container, tombstone, and removed-child origins', () => {
    const registry = createLayerRegistry([
      {
        kind: 'env',
        name: 'input',
        source: { inputReferences: ['FIXTURE_INPUT'] },
      },
    ]);
    const layer = registry.getLayerByName('input');
    const inputReferenceId = registry.getReferenceId('FIXTURE_INPUT');
    if (layer === undefined || inputReferenceId === undefined) {
      throw new Error('Missing fixture registry entry');
    }
    const shared = {
      inputReferenceId,
      secret: false,
      transformed: true,
    } as const;
    const containerOrigin = createOriginRecord(registry, layer.id, {
      ...shared,
      operation: 'merge',
      scope: 'container',
    });
    const leafOrigin = createOriginRecord(registry, layer.id, {
      ...shared,
      operation: 'replace',
      scope: 'leaf',
    });
    const removalOrigin = createOriginRecord(registry, layer.id, {
      ...shared,
      operation: 'remove',
      scope: 'tombstone',
    });
    const tombstone = createTombstoneProvenanceNode(removalOrigin);
    const leaf = createLeafProvenanceNode(leafOrigin, undefined, [
      ['removed-child', tombstone],
    ]);
    const tree = createProvenanceTree(
      createContainerProvenanceNode('object', containerOrigin, [
        ['leaf', leaf],
        ['removed', tombstone],
      ]),
      'full',
    );

    const result = applySecretPathPolicy(
      tree,
      registry,
      createSecretPathMatcher(['']),
      'fixture-key',
    );
    expect(result.root).toMatchObject({
      current: {
        inputReferenceId,
        scope: 'container',
        secret: true,
        transformed: true,
      },
      secret: true,
    });
    expect(getProvenanceNode(result, ['leaf'])).toMatchObject({
      current: { scope: 'leaf', secret: true, transformed: true },
      secret: true,
    });
    expect(getNearestTombstone(result, ['removed'])).toMatchObject({
      removal: { scope: 'tombstone', secret: true, transformed: true },
      secret: true,
    });
    expect(
      getNearestTombstone(result, ['leaf', 'removed-child']),
    ).toMatchObject({ secret: true });
  });

  it('preserves an empty provenance root and its mode', () => {
    const registry = createLayerRegistry([]);
    expect(
      applySecretPathPolicy(
        createProvenanceTree(undefined, 'full'),
        registry,
        createSecretPathMatcher(undefined),
      ),
    ).toEqual({ mode: 'full', root: undefined });
  });
});
