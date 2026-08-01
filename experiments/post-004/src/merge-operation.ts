import type { MergeStrategy } from '@worldhacker/kasane';

export type ConstrainedMergeOperation =
  | Readonly<{
      direction: 'append' | 'prepend';
      kind: 'array-concat';
      maxItems: number;
    }>
  | Readonly<{ kind: 'object-merge' }>
  | Readonly<{ kind: 'replace' }>;

function invalid(): never {
  throw new TypeError('Constrained merge operation is invalid');
}

function dataRecord(input: unknown): Readonly<Record<string, unknown>> {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return invalid();
  }
  const prototype = Object.getPrototypeOf(input) as unknown;
  if (prototype !== Object.prototype && prototype !== null) return invalid();
  if (Object.getOwnPropertySymbols(input).length > 0) return invalid();
  const descriptors = Object.getOwnPropertyDescriptors(input);
  for (const descriptor of Object.values(descriptors)) {
    if (!('value' in descriptor) || !descriptor.enumerable) return invalid();
  }
  return Object.fromEntries(
    Object.entries(descriptors).map(([key, descriptor]) => [
      key,
      descriptor.value,
    ]),
  );
}

function exactKeys(
  input: Readonly<Record<string, unknown>>,
  expected: readonly string[],
): void {
  const actual = Object.keys(input).sort();
  const sortedExpected = [...expected].sort();
  if (
    actual.length !== sortedExpected.length ||
    actual.some((key, index) => key !== sortedExpected[index])
  ) {
    return invalid();
  }
}

/** Parses declarations only; it deliberately does not add merge behavior. */
export function parseMergeOperation(input: unknown): ConstrainedMergeOperation {
  const record = dataRecord(input);
  if (record['kind'] === 'replace') {
    exactKeys(record, ['kind']);
    return Object.freeze({ kind: 'replace' });
  }
  if (record['kind'] === 'object-merge') {
    exactKeys(record, ['kind']);
    return Object.freeze({ kind: 'object-merge' });
  }
  if (record['kind'] === 'array-concat') {
    exactKeys(record, ['direction', 'kind', 'maxItems']);
    const direction = record['direction'];
    const maxItems = record['maxItems'];
    if (direction !== 'append' && direction !== 'prepend') return invalid();
    if (
      typeof maxItems !== 'number' ||
      !Number.isSafeInteger(maxItems) ||
      maxItems < 0 ||
      maxItems > 100_000
    ) {
      return invalid();
    }
    return Object.freeze({ direction, kind: 'array-concat', maxItems });
  }
  return invalid();
}

export function operationToStableStrategy(
  operation: ConstrainedMergeOperation,
): MergeStrategy {
  if (operation.kind === 'object-merge') return 'merge';
  if (operation.kind === 'array-concat') return operation.direction;
  return 'replace';
}
