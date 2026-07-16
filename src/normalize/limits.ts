import { KasaneSecurityError } from '../errors/index.js';

export interface NormalizeLimits {
  /** Maximum path depth. The root node has depth zero. */
  readonly maxDepth?: number;
  /** Maximum total number of containers and primitive nodes. */
  readonly maxNodes?: number;
  /** Maximum UTF-8 byte length of one string value. */
  readonly maxStringLength?: number;
}

export interface ResolvedNormalizeLimits {
  readonly maxDepth: number;
  readonly maxNodes: number;
  readonly maxStringLength: number;
}

export const DEFAULT_NORMALIZE_LIMITS: ResolvedNormalizeLimits = Object.freeze({
  maxDepth: 64,
  maxNodes: 100_000,
  maxStringLength: 1_000_000,
});

type LimitName = keyof ResolvedNormalizeLimits;

function invalidLimit(reference: string): never {
  throw new KasaneSecurityError('Invalid normalization limits.', {
    details: {
      path: '',
      kind: 'invalid-limit',
      operation: 'normalize',
      reference,
    },
  });
}

function readLimit(input: object, name: LimitName, fallback: number): number {
  let descriptor: PropertyDescriptor | undefined;
  try {
    descriptor = Object.getOwnPropertyDescriptor(input, name);
  } catch {
    return invalidLimit(name);
  }

  if (descriptor === undefined) return fallback;
  if (!('value' in descriptor)) return invalidLimit(name);

  const value: unknown = descriptor.value;
  if (value === undefined) return fallback;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    return invalidLimit(name);
  }

  return value;
}

export function resolveNormalizeLimits(
  input?: NormalizeLimits,
): ResolvedNormalizeLimits {
  if (input === undefined) return DEFAULT_NORMALIZE_LIMITS;
  const candidate: unknown = input;
  if (typeof candidate !== 'object' || candidate === null) {
    return invalidLimit('limits');
  }

  return Object.freeze({
    maxDepth: readLimit(
      candidate,
      'maxDepth',
      DEFAULT_NORMALIZE_LIMITS.maxDepth,
    ),
    maxNodes: readLimit(
      candidate,
      'maxNodes',
      DEFAULT_NORMALIZE_LIMITS.maxNodes,
    ),
    maxStringLength: readLimit(
      candidate,
      'maxStringLength',
      DEFAULT_NORMALIZE_LIMITS.maxStringLength,
    ),
  });
}

/**
 * Counts UTF-8 bytes without allocating an encoded copy. Counting stops as
 * soon as the result exceeds `stopAfter`.
 */
export function boundedUtf8ByteLength(
  value: string,
  stopAfter: number,
): number {
  let bytes = 0;

  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);

    if (codeUnit <= 0x7f) {
      bytes += 1;
    } else if (codeUnit <= 0x7ff) {
      bytes += 2;
    } else if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4;
        index += 1;
      } else {
        bytes += 3;
      }
    } else {
      bytes += 3;
    }

    if (bytes > stopAfter) return bytes;
  }

  return bytes;
}
