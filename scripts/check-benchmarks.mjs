import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const MEBIBYTE = 1024 * 1024;
const actualPath = path.resolve(
  process.env['KASANE_BENCH_OUTPUT'] ??
    path.join('benchmarks', 'results', 'latest.json'),
);
const baselinePath = path.resolve('benchmarks', 'baseline.json');
const actual = JSON.parse(await readFile(actualPath, 'utf8'));
const baseline = JSON.parse(await readFile(baselinePath, 'utf8'));

if (actual.schemaVersion !== 1 || baseline.schemaVersion !== 1) {
  throw new Error('Unsupported benchmark report or baseline schema.');
}

const referenceGate = process.env['KASANE_BENCH_REFERENCE'] === '1';
if (referenceGate) {
  const nodeMajor = Number(process.versions.node.split('.')[0]);
  if (
    process.platform !== 'linux' ||
    process.arch !== 'x64' ||
    nodeMajor !== 24
  ) {
    throw new Error(
      'Reference performance gate requires hosted Ubuntu x64 with Node.js 24.',
    );
  }
}

const actualById = new Map(actual.scenarios.map((entry) => [entry.id, entry]));
const baselineIds = Object.keys(baseline.scenarios).sort();
const actualIds = [...actualById.keys()].sort();
if (JSON.stringify(actualIds) !== JSON.stringify(baselineIds)) {
  throw new Error('Benchmark scenario set differs from the approved baseline.');
}

const failures = [];
for (const id of baselineIds) {
  const expected = baseline.scenarios[id];
  const observed = actualById.get(id);
  if (observed === undefined) {
    failures.push(`${id}: missing result`);
    continue;
  }

  const durationLimit = Math.max(
    expected.durationMedianMs * 2,
    baseline.noiseFloors.durationMs,
  );
  const heapLimit = Math.max(
    expected.heapDeltaMedianBytes * 2,
    baseline.noiseFloors.heapDeltaBytes,
  );
  if (observed.durationMedianMs > durationLimit) {
    failures.push(
      `${id}: ${observed.durationMedianMs.toFixed(2)}ms > 2x baseline ${durationLimit.toFixed(2)}ms`,
    );
  }
  if (observed.heapDeltaMedianBytes > heapLimit) {
    failures.push(
      `${id}: ${(observed.heapDeltaMedianBytes / MEBIBYTE).toFixed(2)}MB > 2x baseline ${(heapLimit / MEBIBYTE).toFixed(2)}MB`,
    );
  }
}

const hardBudgets = [
  {
    durationMs: 500,
    heapBytes: 100 * MEBIBYTE,
    id: 'load/l10/n10000/d5/origin-only/freeze-on',
  },
  {
    durationMs: 1_200,
    heapBytes: 220 * MEBIBYTE,
    id: 'load/l10/n10000/d5/full/freeze-on',
  },
];
for (const budget of referenceGate ? hardBudgets : []) {
  const observed = actualById.get(budget.id);
  if (observed === undefined) {
    failures.push(`${budget.id}: missing hard-budget result`);
    continue;
  }
  if (observed.durationMedianMs >= budget.durationMs) {
    failures.push(
      `${budget.id}: ${observed.durationMedianMs.toFixed(2)}ms >= hard budget ${String(budget.durationMs)}ms`,
    );
  }
  if (observed.heapDeltaMedianBytes >= budget.heapBytes) {
    failures.push(
      `${budget.id}: ${(observed.heapDeltaMedianBytes / MEBIBYTE).toFixed(2)}MB >= hard budget ${String(budget.heapBytes / MEBIBYTE)}MB`,
    );
  }
}

if (failures.length > 0) {
  throw new Error(`Performance budget failures:\n${failures.join('\n')}`);
}

process.stdout.write(
  `Performance budgets passed on ${os.platform()} ${os.arch()} Node ${process.versions.node} (${String(actualIds.length)} scenarios).\n`,
);
