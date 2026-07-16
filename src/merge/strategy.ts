import type { ConfigNode } from '../normalize/types.js';

export const MERGE_STRATEGIES = Object.freeze([
  'replace',
  'merge',
  'append',
  'prepend',
] as const);

export type MergeStrategy = (typeof MERGE_STRATEGIES)[number];

export type ConfigNodeKind =
  'null' | 'boolean' | 'number' | 'string' | 'array' | 'object';

export type ExistingValueKind = 'absent' | ConfigNodeKind;
export type IncomingValueKind = 'undefined' | 'remove' | ConfigNodeKind;

export type MergeOutcome =
  'no-op' | 'set' | 'remove' | 'replace' | 'merge' | 'append' | 'prepend';

export type MergeMismatchReason =
  | 'merge-requires-object-pair'
  | 'append-requires-array-pair'
  | 'prepend-requires-array-pair';

export type MergeDecision =
  | Readonly<{ outcome: MergeOutcome }>
  | Readonly<{ outcome: 'error'; reason: MergeMismatchReason }>;

const NO_OP: MergeDecision = Object.freeze({ outcome: 'no-op' });
const SET: MergeDecision = Object.freeze({ outcome: 'set' });
const REMOVE: MergeDecision = Object.freeze({ outcome: 'remove' });
const REPLACE: MergeDecision = Object.freeze({ outcome: 'replace' });
const MERGE: MergeDecision = Object.freeze({ outcome: 'merge' });
const APPEND: MergeDecision = Object.freeze({ outcome: 'append' });
const PREPEND: MergeDecision = Object.freeze({ outcome: 'prepend' });

function mismatch(reason: MergeMismatchReason): MergeDecision {
  return Object.freeze({ outcome: 'error', reason });
}

export function isMergeStrategy(value: unknown): value is MergeStrategy {
  return (
    value === 'replace' ||
    value === 'merge' ||
    value === 'append' ||
    value === 'prepend'
  );
}

/** Classifies a canonical node without inspecting user-defined prototypes. */
export function configNodeKind(value: ConfigNode): ConfigNodeKind {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';

  switch (typeof value) {
    case 'boolean':
      return 'boolean';
    case 'number':
      return 'number';
    case 'string':
      return 'string';
    case 'object':
      return 'object';
  }
}

/**
 * Resolves one cell of the normative merge table without merging values.
 *
 * `undefined`, `remove`, and an absent old value are resolved before a strategy
 * can apply. Consequently explicit type requirements concern present pairs.
 */
export function resolveMergeDecision(
  existing: ExistingValueKind,
  incoming: IncomingValueKind,
  strategy?: MergeStrategy,
): MergeDecision {
  if (incoming === 'undefined') return NO_OP;
  if (incoming === 'remove') return REMOVE;
  if (existing === 'absent') return SET;

  if (strategy === undefined) {
    return existing === 'object' && incoming === 'object' ? MERGE : REPLACE;
  }

  switch (strategy) {
    case 'replace':
      return REPLACE;
    case 'merge':
      return existing === 'object' && incoming === 'object'
        ? MERGE
        : mismatch('merge-requires-object-pair');
    case 'append':
      return existing === 'array' && incoming === 'array'
        ? APPEND
        : mismatch('append-requires-array-pair');
    case 'prepend':
      return existing === 'array' && incoming === 'array'
        ? PREPEND
        : mismatch('prepend-requires-array-pair');
  }
}
