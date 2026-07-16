import { performance } from 'node:perf_hooks';

import { createMergeRuleIndex, mergeConfigNodes } from '../dist/merge/index.js';
import { createLayerRegistry } from '../dist/provenance/registry.js';

const LEAF_COUNT = 2_000;
const LAYER_NAMES = [
  'defaults',
  'application',
  'environment',
  'secrets',
  'runtime',
];

function createLayerValue(layerIndex) {
  const values = {};
  for (let index = 0; index < LEAF_COUNT; index += 1) {
    values[`key-${index}`] = layerIndex * LEAF_COUNT + index;
  }
  return { values };
}

function countHistoryEntries(node) {
  if (node === undefined) return 0;
  let count = node.history?.length ?? 0;
  if (node.state === 'value' && node.kind !== 'leaf') {
    for (const child of node.children.values()) {
      count += countHistoryEntries(child);
    }
  }
  return count;
}

function runMode(provenanceMode) {
  const registry = createLayerRegistry(
    LAYER_NAMES.map((name) => ({ kind: 'value', name })),
  );
  const rules = createMergeRuleIndex([]);
  let output;
  globalThis.gc?.();
  const heapBefore = process.memoryUsage().heapUsed;
  const startedAt = performance.now();

  for (const [layerIndex, layerName] of LAYER_NAMES.entries()) {
    const layer = registry.getLayerByName(layerName);
    if (layer === undefined) throw new Error(`Missing layer: ${layerName}`);

    output = mergeConfigNodes({
      base: output?.value,
      layer: createLayerValue(layerIndex),
      layerId: layer.id,
      provenanceMode,
      registry,
      rules,
      ...(output?.provenance === undefined
        ? {}
        : { baseProvenance: output.provenance }),
    });
  }

  if (output === undefined) throw new Error('Benchmark produced no output');
  globalThis.gc?.();
  const heapAfter = process.memoryUsage().heapUsed;
  const values = output.value?.values;
  if (
    values === null ||
    typeof values !== 'object' ||
    Array.isArray(values) ||
    values[`key-${LEAF_COUNT - 1}`] !==
      (LAYER_NAMES.length - 1) * LEAF_COUNT + LEAF_COUNT - 1
  ) {
    throw new Error(`Incorrect final value in ${provenanceMode} mode`);
  }
  if (output.provenanceMode !== provenanceMode) {
    throw new Error(`Incorrect mode metadata in ${provenanceMode} mode`);
  }
  if ((provenanceMode === 'none') !== (output.provenance === undefined)) {
    throw new Error(`Incorrect tree presence in ${provenanceMode} mode`);
  }

  return {
    durationMs: Number((performance.now() - startedAt).toFixed(2)),
    heapDeltaBytes: heapAfter - heapBefore,
    historyEntries: countHistoryEntries(output.provenance?.root),
    mode: provenanceMode,
  };
}

export function run() {
  const results = ['none', 'origin-only', 'full'].map(runMode);
  const histories = Object.fromEntries(
    results.map((result) => [result.mode, result.historyEntries]),
  );

  if (
    histories.none !== 0 ||
    histories['origin-only'] !== 0 ||
    histories.full === 0
  ) {
    throw new Error('Provenance history mode behavior failed smoke validation');
  }

  process.stdout.write(`provenance-smoke ${JSON.stringify(results)}\n`);
}
