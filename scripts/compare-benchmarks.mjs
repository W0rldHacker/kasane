import { readFile } from 'node:fs/promises';
import path from 'node:path';

const beforePath = path.resolve(
  process.env['KASANE_BENCH_BEFORE'] ??
    path.join('benchmarks', 'baseline.json'),
);
const afterPath = path.resolve(
  process.env['KASANE_BENCH_AFTER'] ??
    path.join('benchmarks', 'results', 'latest.json'),
);
const before = JSON.parse(await readFile(beforePath, 'utf8'));
const after = JSON.parse(await readFile(afterPath, 'utf8'));

if (before.schemaVersion !== 1 || after.schemaVersion !== 1) {
  throw new Error('Unsupported benchmark report schema.');
}

const beforeEntries = Array.isArray(before.scenarios)
  ? before.scenarios
  : Object.entries(before.scenarios).map(([id, result]) => ({
      id,
      ...result,
    }));
const beforeById = new Map(beforeEntries.map((entry) => [entry.id, entry]));
const afterById = new Map(after.scenarios.map((entry) => [entry.id, entry]));
const beforeIds = [...beforeById.keys()].sort();
const afterIds = [...afterById.keys()].sort();
if (JSON.stringify(beforeIds) !== JSON.stringify(afterIds)) {
  throw new Error('Before/after benchmark scenario sets differ.');
}

const durationFloor = before.noiseFloors?.durationMs ?? 5;
const comparisons = beforeIds.map((id) => {
  const earlier = beforeById.get(id);
  const later = afterById.get(id);
  if (earlier === undefined || later === undefined) {
    throw new Error(`Missing benchmark scenario: ${id}`);
  }
  return {
    afterHeap: later.heapDeltaMedianBytes,
    afterMs: later.durationMedianMs,
    beforeHeap: earlier.heapDeltaMedianBytes,
    beforeMs: earlier.durationMedianMs,
    durationPercent:
      (later.durationMedianMs / earlier.durationMedianMs - 1) * 100,
    id,
  };
});

const timed = comparisons.filter((entry) => entry.beforeMs >= durationFloor);
const durationGeomean =
  Math.exp(
    timed.reduce(
      (sum, entry) => sum + Math.log(entry.afterMs / entry.beforeMs),
      0,
    ) / timed.length,
  ) - 1;
const beforeHeapTotal = comparisons.reduce(
  (sum, entry) => sum + entry.beforeHeap,
  0,
);
const afterHeapTotal = comparisons.reduce(
  (sum, entry) => sum + entry.afterHeap,
  0,
);
const heapTotalChange = afterHeapTotal / beforeHeapTotal - 1;

const material = comparisons
  .filter((entry) => Math.abs(entry.afterMs - entry.beforeMs) >= durationFloor)
  .sort((left, right) => left.durationPercent - right.durationPercent);
const improvements = material
  .filter((entry) => entry.durationPercent < 0)
  .slice(0, 5);
const regressions = material
  .filter((entry) => entry.durationPercent > 0)
  .reverse()
  .slice(0, 5);

function printRows(label, rows) {
  process.stdout.write(`${label}:\n`);
  if (rows.length === 0) {
    process.stdout.write('  none above the duration noise floor\n');
    return;
  }
  for (const row of rows) {
    process.stdout.write(
      `  ${row.durationPercent.toFixed(1).padStart(7)}%  ${row.beforeMs.toFixed(2)}ms -> ${row.afterMs.toFixed(2)}ms  ${row.id}\n`,
    );
  }
}

process.stdout.write(
  `Benchmark comparison: ${path.relative(process.cwd(), beforePath)} -> ${path.relative(process.cwd(), afterPath)}\n`,
);
process.stdout.write(
  `Duration geomean (${String(timed.length)} scenarios above ${String(durationFloor)}ms): ${(durationGeomean * 100).toFixed(1)}%\n`,
);
process.stdout.write(
  `Sum of retained-heap medians (${String(comparisons.length)} scenarios): ${(heapTotalChange * 100).toFixed(1)}%\n`,
);
printRows('Largest measurable duration improvements', improvements);
printRows('Largest measurable duration regressions', regressions);
