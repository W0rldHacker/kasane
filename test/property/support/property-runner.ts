import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import * as fc from 'fast-check';

import { encodeFixture } from './types.js';

type PropertyProfile = 'fast' | 'nightly';

function readProfile(): PropertyProfile {
  const profile = process.env['KASANE_PROPERTY_PROFILE'] ?? 'fast';
  if (profile === 'fast' || profile === 'nightly') return profile;
  throw new Error(`Unknown property profile: ${profile}`);
}

function readSeed(): number | undefined {
  const raw = process.env['KASANE_PROPERTY_SEED'];
  if (raw === undefined) return undefined;
  const seed = Number(raw);
  if (!Number.isSafeInteger(seed)) {
    throw new Error(`Invalid property seed: ${raw}`);
  }
  return seed;
}

export const PROPERTY_PROFILE = readProfile();
export const PROPERTY_SEED = readSeed();
export const PROPERTY_MULTIPLIER = PROPERTY_PROFILE === 'nightly' ? 10 : 1;

export function profileRuns(fastRuns: number): number {
  return fastRuns * PROPERTY_MULTIPLIER;
}

export async function runProperty<Ts>(
  name: string,
  property: fc.IAsyncProperty<Ts>,
  fastRuns: number,
): Promise<void> {
  const details = await fc.check(property, {
    numRuns: profileRuns(fastRuns),
    ...(PROPERTY_SEED === undefined ? {} : { seed: PROPERTY_SEED }),
  });
  if (!details.failed) return;

  const regressionDirectory = path.resolve('test', 'property', 'regressions');
  const regressionPath = path.join(regressionDirectory, 'last-failure.json');
  const artifact = {
    counterexample: encodeFixture(details.counterexample),
    numShrinks: details.numShrinks,
    path: details.counterexamplePath,
    profile: PROPERTY_PROFILE,
    property: name,
    seed: details.seed,
  };
  await mkdir(regressionDirectory, { recursive: true });
  await writeFile(
    regressionPath,
    `${JSON.stringify(artifact, undefined, 2)}\n`,
    'utf8',
  );

  const report = await fc.asyncDefaultReportMessage(details);
  throw new Error(
    [
      `Property ${name} failed.`,
      `seed=${String(details.seed)}`,
      `path=${details.counterexamplePath ?? '<none>'}`,
      `minimized fixture=${regressionPath}`,
      report,
    ]
      .filter((line) => line !== undefined)
      .join('\n'),
    details.errorInstance === null
      ? undefined
      : { cause: details.errorInstance },
  );
}
