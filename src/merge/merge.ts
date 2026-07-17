import { KasaneMergeError } from '../errors/index.js';
import type { ConfigNode } from '../normalize/types.js';
import { DEFAULT_PROVENANCE_MODE } from '../provenance/history.js';
import type { ProvenanceMode } from '../provenance/history.js';
import type {
  LayerId,
  LayerRegistry,
  SourceReferenceId,
} from '../provenance/registry.js';
import { createProvenanceTree } from '../provenance/tree.js';
import type { ProvenanceTree } from '../provenance/tree.js';
import { mergeNode } from './merge-node.js';
import type { MergeLayerNode } from './remove.js';
import type { MergeRuleIndex } from './rule-index.js';
import type { SecretPathMatcher } from '../secrets/matcher.js';
import type { FingerprintKey } from '../secrets/fingerprint.js';

export interface MergeInput {
  readonly base: ConfigNode | undefined;
  readonly baseProvenance?: ProvenanceTree;
  readonly inputReferenceId?: SourceReferenceId;
  readonly inputReferenceIds?: ReadonlyMap<string, SourceReferenceId>;
  readonly fingerprintKey?: FingerprintKey;
  readonly layer: MergeLayerNode | undefined;
  readonly layerId: LayerId;
  readonly provenanceMode?: ProvenanceMode;
  readonly registry: LayerRegistry;
  readonly rules: MergeRuleIndex;
  readonly secret?: boolean;
  readonly secretPaths?: ReadonlySet<string>;
  readonly secretPolicy?: SecretPathMatcher;
}

export interface MergeOutput {
  readonly value: ConfigNode | undefined;
  /** Snapshot metadata, including `none` when no provenance tree exists. */
  readonly provenanceMode: ProvenanceMode;
  /** `undefined` only in `none` mode; enabled modes own a tree, possibly empty. */
  readonly provenance: ProvenanceTree | undefined;
}

function failMergeInput(input: MergeInput, kind: string, path = ''): never {
  throw new KasaneMergeError('Configuration merge input is inconsistent.', {
    details: {
      path,
      layerId: input.layerId,
      kind,
      operation: 'merge',
    },
  });
}

/**
 * Pure layer-by-layer merge. The returned value and provenance are produced by
 * the same traversal and are not reconstructed from one another afterwards.
 */
export function mergeConfigNodes(input: MergeInput): MergeOutput {
  const provenanceMode = input.provenanceMode ?? DEFAULT_PROVENANCE_MODE;

  if (input.registry.getLayer(input.layerId) === undefined) {
    return failMergeInput(input, 'unknown-layer-id');
  }

  if (
    input.inputReferenceId !== undefined &&
    input.registry.getReference(input.inputReferenceId) === undefined
  ) {
    return failMergeInput(input, 'unknown-source-reference-id');
  }

  for (const referenceId of input.inputReferenceIds?.values() ?? []) {
    if (input.registry.getReference(referenceId) === undefined) {
      return failMergeInput(input, 'unknown-source-reference-id');
    }
  }

  if (
    provenanceMode !== 'none' &&
    input.baseProvenance !== undefined &&
    input.baseProvenance.mode !== provenanceMode
  ) {
    return failMergeInput(input, 'provenance-mode-mismatch');
  }

  if (
    provenanceMode !== 'none' &&
    input.base !== undefined &&
    input.baseProvenance?.root === undefined
  ) {
    return failMergeInput(input, 'missing-base-provenance');
  }

  const result = mergeNode(
    input.base,
    provenanceMode === 'none' ? undefined : input.baseProvenance?.root,
    input.layer,
    '',
    {
      layerId: input.layerId,
      provenanceMode,
      registry: input.registry,
      rules: input.rules,
      secret: input.secret ?? false,
      ...(input.fingerprintKey === undefined
        ? {}
        : { fingerprintKey: input.fingerprintKey }),
      ...(input.secretPaths === undefined
        ? {}
        : { secretPaths: input.secretPaths }),
      ...(input.secretPolicy === undefined
        ? {}
        : { secretPolicy: input.secretPolicy }),
      ...(input.inputReferenceId === undefined
        ? {}
        : { inputReferenceId: input.inputReferenceId }),
      ...(input.inputReferenceIds === undefined
        ? {}
        : { inputReferenceIds: input.inputReferenceIds }),
    },
  );

  return Object.freeze({
    value: result.value,
    provenanceMode,
    provenance:
      provenanceMode === 'none'
        ? undefined
        : createProvenanceTree(result.provenance, provenanceMode),
  });
}

export type { ProvenanceMode } from '../provenance/history.js';
