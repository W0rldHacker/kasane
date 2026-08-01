import { spawnSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const MAX_INSTANTIATIONS = 250_000;
const MAX_WALL_TIME_MS = 20_000;
const MAX_RATIO = 8;
const RATIO_ALLOWANCE = 25_000;
const experimentRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
const workspaceRoot = path.resolve(experimentRoot, '../..');
const tsc = path.join(
  workspaceRoot,
  'node_modules',
  'typescript',
  'bin',
  'tsc',
);

interface Measurement {
  readonly elapsedMs: number;
  readonly instantiations: number;
}

function measure(project: string): Measurement {
  const started = performance.now();
  const result = spawnSync(
    process.execPath,
    [tsc, '-p', project, '--extendedDiagnostics', '--pretty', 'false'],
    { cwd: workspaceRoot, encoding: 'utf8' },
  );
  const elapsedMs = performance.now() - started;
  const output = `${result.stdout}${result.stderr}`;
  if (result.status !== 0) {
    process.stderr.write(output);
    throw new Error(`Type benchmark failed for ${project}`);
  }
  const match = /^Instantiations:\s+([\d,]+)$/mu.exec(output);
  if (match?.[1] === undefined) {
    throw new Error('TypeScript did not report instantiations');
  }
  return Object.freeze({
    elapsedMs,
    instantiations: Number(match[1].replaceAll(',', '')),
  });
}

const plain = measure(
  path.join(
    workspaceRoot,
    'test',
    'fixtures',
    'type-performance',
    'tsconfig.json',
  ),
);
const typed = measure(path.join(experimentRoot, 'fixtures', 'tsconfig.json'));
const ratioLimit = plain.instantiations * MAX_RATIO + RATIO_ALLOWANCE;
const report = {
  budgets: {
    maxInstantiations: MAX_INSTANTIATIONS,
    maxRatio: MAX_RATIO,
    maxWallTimeMs: MAX_WALL_TIME_MS,
    ratioAllowance: RATIO_ALLOWANCE,
  },
  plain: {
    elapsedMs: Number(plain.elapsedMs.toFixed(1)),
    instantiations: plain.instantiations,
  },
  schemaVersion: 1,
  typed: {
    elapsedMs: Number(typed.elapsedMs.toFixed(1)),
    instantiations: typed.instantiations,
    ratio: Number((typed.instantiations / plain.instantiations).toFixed(2)),
  },
};
console.log(JSON.stringify(report));

if (process.argv.includes('--check')) {
  if (typed.instantiations > MAX_INSTANTIATIONS) {
    throw new Error('Typed path prototype exceeded the instantiation budget');
  }
  if (typed.instantiations > ratioLimit) {
    throw new Error(
      'Typed path prototype exceeded the relative instantiation budget',
    );
  }
  if (typed.elapsedMs > MAX_WALL_TIME_MS) {
    throw new Error('Typed path prototype exceeded the wall-time budget');
  }
}
