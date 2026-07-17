import { KasaneSecurityError } from '../errors/index.js';
import {
  DEFAULT_NORMALIZE_LIMITS,
  resolveNormalizeLimits,
} from '../normalize/index.js';
import type {
  NormalizeLimits,
  ResolvedNormalizeLimits,
} from '../normalize/index.js';

export interface KasaneLimits extends NormalizeLimits {
  /** Maximum bytes read by a built-in file source before its parser runs. */
  readonly maxSourceBytes?: number;
}

export interface ResolvedKasaneLimits extends ResolvedNormalizeLimits {
  readonly maxSourceBytes: number;
}

export const DEFAULT_MAX_SOURCE_BYTES = 10_000_000;

export const DEFAULT_KASANE_LIMITS: ResolvedKasaneLimits = Object.freeze({
  ...DEFAULT_NORMALIZE_LIMITS,
  maxSourceBytes: DEFAULT_MAX_SOURCE_BYTES,
});

function invalidLimit(reference: string): never {
  throw new KasaneSecurityError('Invalid security limits.', {
    details: {
      kind: 'invalid-limit',
      operation: 'resolve-limits',
      reference,
    },
  });
}

function maxSourceBytes(input: object): number {
  let descriptor: PropertyDescriptor | undefined;
  try {
    descriptor = Object.getOwnPropertyDescriptor(input, 'maxSourceBytes');
  } catch {
    return invalidLimit('maxSourceBytes');
  }

  if (descriptor === undefined) return DEFAULT_MAX_SOURCE_BYTES;
  if (!('value' in descriptor)) return invalidLimit('maxSourceBytes');
  const value: unknown = descriptor.value;
  if (value === undefined) return DEFAULT_MAX_SOURCE_BYTES;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    return invalidLimit('maxSourceBytes');
  }
  return value;
}

/** Resolves one immutable limit set shared by every pipeline boundary. */
export function resolveKasaneLimits(input?: KasaneLimits): ResolvedKasaneLimits;
export function resolveKasaneLimits(input?: unknown): ResolvedKasaneLimits {
  if (input === undefined) return DEFAULT_KASANE_LIMITS;
  if (typeof input !== 'object' || input === null) {
    return invalidLimit('limits');
  }

  return Object.freeze({
    ...resolveNormalizeLimits(input as KasaneLimits),
    maxSourceBytes: maxSourceBytes(input),
  });
}
