import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import * as fc from 'fast-check';

function readPositiveInteger(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`Invalid ${name}: ${raw}`);
  }
  return value;
}

function readSeed(): number | undefined {
  const raw = process.env['KASANE_FUZZ_SEED'];
  if (raw === undefined) return undefined;
  const seed = Number(raw);
  if (!Number.isSafeInteger(seed) || seed < 1) {
    throw new Error(`Invalid KASANE_FUZZ_SEED: ${raw}`);
  }
  return seed;
}

export const FUZZ_RUNS = readPositiveInteger('KASANE_FUZZ_RUNS', 2_000);
export const FUZZ_TIMEOUT_MS = readPositiveInteger(
  'KASANE_FUZZ_TIMEOUT_MS',
  600_000,
);
export const FUZZ_SEED = readSeed();

const weights = [59, 15, 15, 10, 1] as const;

/** Splits the requested total across all fuzz properties without extra cases. */
export function allocatedFuzzRuns(index: number): number {
  if (index < 0 || index >= weights.length) {
    throw new RangeError(`Unknown fuzz allocation index: ${String(index)}`);
  }
  if (index === weights.length - 1) {
    let allocated = 0;
    for (let current = 0; current < index; current += 1) {
      allocated += Math.floor((FUZZ_RUNS * (weights[current] ?? 0)) / 100);
    }
    return Math.max(1, FUZZ_RUNS - allocated);
  }
  return Math.max(1, Math.floor((FUZZ_RUNS * (weights[index] ?? 0)) / 100));
}

function encodeCounterexample(value: unknown): unknown {
  if (value === undefined) return { $type: 'undefined' };
  if (typeof value === 'bigint')
    return { $type: 'bigint', value: String(value) };
  if (typeof value === 'symbol' || typeof value === 'function') {
    return { $type: typeof value };
  }
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof Uint8Array) return [...value];
  if (Array.isArray(value)) return value.map(encodeCounterexample);

  return Object.fromEntries(
    Reflect.ownKeys(value)
      .filter((key): key is string => typeof key === 'string')
      .sort()
      .map((key) => {
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        return [
          key,
          descriptor !== undefined && 'value' in descriptor
            ? encodeCounterexample(descriptor.value)
            : { $type: 'accessor' },
        ];
      }),
  );
}

export async function runFuzzProperty<Ts>(
  name: string,
  property: fc.IAsyncProperty<Ts>,
  numRuns: number,
): Promise<void> {
  const details = await fc.check(property, {
    numRuns,
    ...(FUZZ_SEED === undefined ? {} : { seed: FUZZ_SEED }),
  });
  if (!details.failed) return;

  const regressionDirectory = path.resolve('test', 'fuzz-corpus', 'generated');
  const regressionPath = path.join(regressionDirectory, 'last-failure.json');
  await mkdir(regressionDirectory, { recursive: true });
  await writeFile(
    regressionPath,
    `${JSON.stringify(
      {
        counterexample: encodeCounterexample(details.counterexample),
        numShrinks: details.numShrinks,
        path: details.counterexamplePath,
        property: name,
        runs: numRuns,
        seed: details.seed,
      },
      undefined,
      2,
    )}\n`,
    'utf8',
  );

  const report = await fc.asyncDefaultReportMessage(details);
  throw new Error(
    [
      `Security fuzz property ${name} failed.`,
      `seed=${String(details.seed)}`,
      `path=${details.counterexamplePath ?? '<none>'}`,
      `minimized corpus=${regressionPath}`,
      report,
    ].join('\n'),
    details.errorInstance === null
      ? undefined
      : { cause: details.errorInstance },
  );
}
