import { spawnSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import path from 'node:path';
import process from 'node:process';

const MAX_INSTANTIATIONS = 150_000;
const MAX_WALL_TIME_MS = 15_000;
const cli = path.resolve('node_modules/typescript/bin/tsc');
const started = performance.now();
const result = spawnSync(
  process.execPath,
  [
    cli,
    '-p',
    'test/fixtures/type-performance/tsconfig.json',
    '--extendedDiagnostics',
    '--pretty',
    'false',
  ],
  { cwd: process.cwd(), encoding: 'utf8' },
);
const elapsed = performance.now() - started;
const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
if (result.status !== 0) {
  process.stderr.write(output);
  process.exitCode = result.status ?? 1;
} else {
  const match = output.match(/^Instantiations:\s+([\d,]+)$/mu);
  if (match?.[1] === undefined) {
    throw new Error('TypeScript did not report an instantiation count');
  }
  const instantiations = Number(match[1].replaceAll(',', ''));
  if (instantiations > MAX_INSTANTIATIONS) {
    throw new Error(
      `Type API instantiated ${String(instantiations)} types; budget is ${String(MAX_INSTANTIATIONS)}`,
    );
  }
  if (elapsed > MAX_WALL_TIME_MS) {
    throw new Error(
      `Type performance fixture took ${elapsed.toFixed(0)}ms; budget is ${String(MAX_WALL_TIME_MS)}ms`,
    );
  }
  console.log(
    `Type performance check passed (${String(instantiations)} instantiations, ${elapsed.toFixed(0)}ms)`,
  );
}
