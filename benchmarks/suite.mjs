import os from 'node:os';
import { performance } from 'node:perf_hooks';

import { kasane, secret, value } from '../dist/index.js';
import {
  createLargeArray,
  createLayers,
  createNestedLayer,
  deterministicPaths,
  nestedLeafPath,
} from './generators.mjs';

const WARMUP_RUNS = 1;
const MEASURED_RUNS = 3;
const loadLayerCounts = [1, 10];
const loadLeafCounts = [100, 1_000, 10_000];
const loadDepths = [5, 20];
const provenanceModes = ['none', 'origin-only', 'full'];

function median(values) {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.floor(ordered.length / 2)] ?? 0;
}

async function measureScenario(definition) {
  for (let index = 0; index < WARMUP_RUNS; index += 1) {
    await runWarmup(definition.operation);
  }

  const durationSamplesMs = [];
  const heapDeltaSamplesBytes = [];
  for (let index = 0; index < MEASURED_RUNS; index += 1) {
    const sample = await measureOnce(definition);
    durationSamplesMs.push(sample.durationMs);
    heapDeltaSamplesBytes.push(sample.heapDeltaBytes);
  }

  return {
    category: definition.category,
    durationMedianMs: Number(median(durationSamplesMs).toFixed(3)),
    durationSamplesMs: durationSamplesMs.map((value) =>
      Number(value.toFixed(3)),
    ),
    heapDeltaMedianBytes: Math.round(median(heapDeltaSamplesBytes)),
    heapDeltaSamplesBytes,
    id: definition.id,
    parameters: definition.parameters,
  };
}

async function runWarmup(operation) {
  await operation();
}

async function measureOnce(definition) {
  globalThis.gc();
  const heapBefore = process.memoryUsage().heapUsed;
  const startedAt = performance.now();
  const retained = await definition.operation();
  const durationMs = performance.now() - startedAt;
  globalThis.gc();
  const heapAfter = process.memoryUsage().heapUsed;
  definition.validate(retained);
  return {
    durationMs,
    heapDeltaBytes: Math.max(0, heapAfter - heapBefore),
  };
}

function loadDefinitions() {
  const definitions = [];
  for (const layerCount of loadLayerCounts) {
    for (const leafCount of loadLeafCounts) {
      for (const depth of loadDepths) {
        for (const provenance of provenanceModes) {
          const layers = createLayers(layerCount, leafCount, depth, value);
          const expected = (layerCount - 1) * leafCount + (leafCount - 1);
          const path = nestedLeafPath(depth, leafCount - 1);
          definitions.push({
            category: 'load',
            id: `load/l${String(layerCount)}/n${String(leafCount)}/d${String(depth)}/${provenance}/freeze-on`,
            operation: () => kasane({ layers, provenance }),
            parameters: {
              depth,
              freeze: true,
              layerCount,
              leafCount,
              provenance,
            },
            validate: (snapshot) => {
              if (snapshot.get(path) !== expected) {
                throw new Error('Load benchmark produced an invalid snapshot.');
              }
              const history = snapshot.explain(path).history;
              if (
                (provenance === 'full' && history?.length !== layerCount) ||
                (provenance !== 'full' && history !== undefined)
              ) {
                throw new Error('Load benchmark produced invalid provenance.');
              }
            },
          });
        }
      }
    }
  }
  return definitions;
}

async function operationDefinitions() {
  const pathDepth = 20;
  const pathLeaves = 1_000;
  const pathSnapshot = await kasane({
    layers: [value('paths', createNestedLayer(pathLeaves, pathDepth, 0))],
    provenance: 'full',
  });
  const lookupPaths = deterministicPaths(pathDepth, pathLeaves, 1_024);

  const beforeDiff = await kasane({
    fingerprintKey: 'benchmark-fixture-key',
    layers: [
      secret('before', {
        tokens: createNestedLayer(1_000, 5, 0),
      }),
    ],
    provenance: 'full',
  });
  const afterDiff = await kasane({
    fingerprintKey: 'benchmark-fixture-key',
    layers: [
      secret('after', {
        tokens: createNestedLayer(1_000, 5, 1),
      }),
    ],
    provenance: 'full',
  });

  const publicBefore = await kasane({
    layers: [value('before', createNestedLayer(10_000, 5, 0))],
  });
  const publicAfter = await kasane({
    layers: [value('after', createNestedLayer(10_000, 5, 1))],
  });
  const freezeLayers = createLayers(10, 10_000, 5, value);
  const arrayBefore = createLargeArray(50_000);
  const arrayAfter = createLargeArray(50_000, 1);

  return [
    {
      category: 'path-cache',
      id: 'path-cache/n1000/d20/lookups1024',
      operation: () => {
        let result;
        for (const path of lookupPaths) result = pathSnapshot.get(path);
        return result;
      },
      parameters: { depth: pathDepth, leafCount: pathLeaves, lookups: 1_024 },
      validate: (result) => {
        if (typeof result !== 'number') throw new Error('Invalid path result.');
      },
    },
    {
      category: 'explain',
      id: 'explain/full/n1000/d20/calls256',
      operation: () => {
        let result;
        for (const path of lookupPaths.slice(0, 256)) {
          result = pathSnapshot.explain(path);
        }
        return result;
      },
      parameters: { calls: 256, depth: pathDepth, provenance: 'full' },
      validate: (result) => {
        if (result?.found !== true) throw new Error('Invalid explain result.');
      },
    },
    {
      category: 'diff',
      id: 'diff/public/n10000/d5',
      operation: () => publicBefore.diff(publicAfter),
      parameters: { leafCount: 10_000, secret: false },
      validate: (result) => {
        if (result.changes.length !== 10_000) {
          throw new Error('Invalid public diff result.');
        }
      },
    },
    {
      category: 'diff',
      id: 'diff/secret-fingerprint/n1000/d5',
      operation: () => beforeDiff.diff(afterDiff),
      parameters: {
        fingerprint: 'hmac-sha256',
        leafCount: 1_000,
        secret: true,
      },
      validate: (result) => {
        if (result.changes.length !== 1_000) {
          throw new Error('Invalid secret fingerprint diff result.');
        }
      },
    },
    {
      category: 'freeze',
      id: 'freeze/off/l10/n10000/d5/origin-only',
      operation: () =>
        kasane({
          freeze: false,
          layers: freezeLayers,
          provenance: 'origin-only',
        }),
      parameters: { freeze: false, layerCount: 10, leafCount: 10_000 },
      validate: (snapshot) => {
        if (Object.isFrozen(snapshot.value)) {
          throw new Error('Freeze-off benchmark produced a frozen value.');
        }
      },
    },
    {
      category: 'large-array',
      id: 'large-array/n50000/replace/freeze-on',
      operation: () =>
        kasane({
          layers: [
            value('array-before', { items: arrayBefore }),
            value('array-after', { items: arrayAfter }),
          ],
        }),
      parameters: { arrayLength: 50_000, freeze: true, strategy: 'replace' },
      validate: (snapshot) => {
        if (snapshot.get('items.49999') !== 50_000) {
          throw new Error('Invalid large array result.');
        }
      },
    },
  ];
}

function environmentMetadata() {
  const cpus = os.cpus();
  return {
    architecture: process.arch,
    ci: process.env['CI'] === 'true',
    cpuCount: cpus.length,
    cpuModel: cpus[0]?.model ?? 'unknown',
    gcExposed: globalThis.gc !== undefined,
    generatedAt: new Date().toISOString(),
    node: process.versions.node,
    operatingSystem: `${os.platform()} ${os.release()}`,
    runner: process.env['RUNNER_NAME'] ?? null,
    runnerImage: process.env['ImageOS'] ?? null,
    totalMemoryBytes: os.totalmem(),
    v8: process.versions.v8,
  };
}

export async function runBenchmarkSuite() {
  const definitions = [...loadDefinitions(), ...(await operationDefinitions())];
  const scenarios = [];
  for (const definition of definitions) {
    scenarios.push(await measureScenario(definition));
  }
  return {
    metadata: environmentMetadata(),
    methodology: {
      deterministicGenerator: 'benchmarks/generators.mjs',
      heapStatistic: 'median retained heap delta after forced GC',
      measuredRuns: MEASURED_RUNS,
      timeStatistic: 'median wall-clock duration',
      warmupRuns: WARMUP_RUNS,
    },
    scenarios,
    schemaVersion: 1,
  };
}
