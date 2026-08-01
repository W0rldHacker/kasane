import { performance } from 'node:perf_hooks';
import process from 'node:process';

import type { KasaneEvent } from '@worldhacker/kasane';

import { parseMergeOperation } from '../src/merge-operation.js';
import { createOtelEventAdapter } from '../src/telemetry.js';
import type { PrototypeSpan, PrototypeTracer } from '../src/telemetry.js';

const ITERATIONS = 100_000;
const MAX_DURATION_MS = 1_000;
const MAX_TELEMETRY_RATIO = 50;
const RATIO_NOISE_MS = 10;
let sink = 0;

function measure(callback: () => void): number {
  callback();
  const started = performance.now();
  callback();
  return performance.now() - started;
}

const event: KasaneEvent = Object.freeze({
  durationMs: 1,
  nodes: 10,
  success: true,
  type: 'snapshot:created',
});
const noopMs = measure(() => {
  for (let index = 0; index < ITERATIONS; index += 1) sink += event.nodes;
});

const span: PrototypeSpan = Object.freeze({
  end(): void {
    sink += 1;
  },
  setAttribute(_name: string, value: boolean | number | string): void {
    if (typeof value === 'number') sink += value;
  },
});
const tracer: PrototypeTracer = Object.freeze({
  startSpan(): PrototypeSpan {
    return span;
  },
});
const adapter = createOtelEventAdapter(tracer);
const telemetryMs = measure(() => {
  for (let index = 0; index < ITERATIONS; index += 1) adapter(event);
});

const declaration = Object.freeze({
  direction: 'append',
  kind: 'array-concat',
  maxItems: 1_000,
});
const mergeParserMs = measure(() => {
  for (let index = 0; index < ITERATIONS; index += 1) {
    sink += parseMergeOperation(declaration).kind.length;
  }
});

const report = {
  budgets: {
    maxDurationMs: MAX_DURATION_MS,
    maxTelemetryRatio: MAX_TELEMETRY_RATIO,
    ratioNoiseMs: RATIO_NOISE_MS,
  },
  iterations: ITERATIONS,
  mergeParserMs: Number(mergeParserMs.toFixed(2)),
  noopMs: Number(noopMs.toFixed(2)),
  schemaVersion: 1,
  telemetryMs: Number(telemetryMs.toFixed(2)),
  telemetryRatio: Number((telemetryMs / noopMs).toFixed(2)),
};
console.log(JSON.stringify(report));

if (process.argv.includes('--check')) {
  if (telemetryMs > MAX_DURATION_MS || mergeParserMs > MAX_DURATION_MS) {
    throw new Error('POST-004 runtime prototype exceeded its absolute budget');
  }
  if (telemetryMs > (noopMs + RATIO_NOISE_MS) * MAX_TELEMETRY_RATIO) {
    throw new Error(
      'Telemetry prototype exceeded its relative overhead budget',
    );
  }
}

void sink;
