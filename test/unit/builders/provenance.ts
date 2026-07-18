import {
  createMergeRuleIndex,
  mergeConfigNodes,
} from '../../../src/merge/index.js';
import type {
  MergeLayerNode,
  MergeOutput,
  MergeRule,
  ProvenanceMode,
} from '../../../src/merge/index.js';
import { createLayerRegistry } from '../../../src/provenance/registry.js';
import type {
  LayerRecord,
  LayerRegistry,
} from '../../../src/provenance/registry.js';

export interface ProvenanceFixture {
  readonly apply: (
    layerName: string,
    layer: MergeLayerNode | undefined,
    previous?: MergeOutput,
    options?: Readonly<{
      mode?: ProvenanceMode;
      rules?: readonly MergeRule[];
      secret?: boolean;
    }>,
  ) => MergeOutput;
  readonly layer: (name: string) => LayerRecord;
  readonly registry: LayerRegistry;
}

/** Creates fresh registry and merge state for every test invocation. */
export function createProvenanceFixture(
  ...layers: readonly Readonly<{ kind?: string; name: string }>[]
): ProvenanceFixture {
  const registry = createLayerRegistry(
    layers.map(({ kind = 'value', name }) => ({ kind, name })),
  );
  const layer = (name: string): LayerRecord => {
    const record = registry.getLayerByName(name);
    if (record === undefined) throw new Error(`Missing fixture layer: ${name}`);
    return record;
  };

  return {
    apply(layerName, value, previous, options = {}) {
      return mergeConfigNodes({
        base: previous?.value,
        layer: value,
        layerId: layer(layerName).id,
        provenanceMode: options.mode ?? 'origin-only',
        registry,
        rules: createMergeRuleIndex(options.rules ?? []),
        secret: options.secret ?? false,
        ...(previous?.provenance === undefined
          ? {}
          : { baseProvenance: previous.provenance }),
      });
    },
    layer,
    registry,
  };
}
