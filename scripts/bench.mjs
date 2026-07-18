import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { runBenchmarkSuite } from '../benchmarks/suite.mjs';

if (globalThis.gc === undefined) {
  throw new Error(
    'Benchmarks require Node.js --expose-gc for heap measurements.',
  );
}

const requested = process.argv.slice(2).filter((argument) => argument !== '--');
if (requested.length > 0) {
  if (requested.length !== 1 || requested[0] !== 'provenance-smoke') {
    throw new Error(`Unknown benchmark selection: ${requested.join(' ')}`);
  }
  const smoke = await import('../benchmarks/provenance-smoke.mjs');
  await smoke.run();
  process.exit(0);
}

const outputPath = path.resolve(
  process.env['KASANE_BENCH_OUTPUT'] ??
    path.join('benchmarks', 'results', 'latest.json'),
);
const report = await runBenchmarkSuite();
await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(
  outputPath,
  `${JSON.stringify(report, undefined, 2)}\n`,
  'utf8',
);

for (const result of report.scenarios) {
  const heapMb = result.heapDeltaMedianBytes / 1024 / 1024;
  process.stdout.write(
    `${result.id.padEnd(48)} ${result.durationMedianMs.toFixed(2).padStart(9)} ms ${heapMb.toFixed(2).padStart(9)} MB\n`,
  );
}
process.stdout.write(`Benchmark report: ${outputPath}\n`);
