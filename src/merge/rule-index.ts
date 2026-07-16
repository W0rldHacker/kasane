import { KasaneMergeError } from '../errors/index.js';
import { isMergeStrategy } from './strategy.js';
import type { MergeStrategy } from './strategy.js';

export interface MergeRule {
  readonly path: string;
  readonly strategy: MergeStrategy;
}

/** Read-only exact canonical-path lookup used by the future merge engine. */
export interface MergeRuleIndex {
  readonly size: number;
  get(canonicalPath: string): MergeStrategy | undefined;
  has(canonicalPath: string): boolean;
}

function invalidRule(kind: string, path?: string): never {
  throw new KasaneMergeError('Invalid merge rule declaration.', {
    details: {
      ...(path === undefined ? {} : { path }),
      kind,
      operation: 'index-merge-rules',
    },
  });
}

function escapeSegment(segment: string): string {
  let escaped = '';
  let index = 0;

  while (index < segment.length) {
    const character = segment[index] ?? '';
    if (character === '\\' || character === '.') escaped += '\\';
    escaped += character;
    index += 1;
  }

  return escaped;
}

function canonicalizeRulePath(path: string): string {
  if (path === '') return '';

  const segments: string[] = [];
  let segment = '';
  let index = 0;

  while (index < path.length) {
    const character = path[index] ?? '';

    if (character === '.') {
      if (segment === '') return invalidRule('invalid-rule-path');
      segments.push(segment);
      segment = '';
      index += 1;
      continue;
    }

    if (character === '\\') {
      const escaped = path[index + 1];
      if (escaped !== '.' && escaped !== '\\') {
        return invalidRule('invalid-rule-path');
      }
      segment += escaped;
      index += 2;
      continue;
    }

    segment += character;
    index += 1;
  }

  if (segment === '') return invalidRule('invalid-rule-path');
  segments.push(segment);
  return segments.map(escapeSegment).join('.');
}

class ExactMergeRuleIndex implements MergeRuleIndex {
  readonly #rules: ReadonlyMap<string, MergeStrategy>;
  readonly size: number;

  constructor(rules: ReadonlyMap<string, MergeStrategy>) {
    this.#rules = rules;
    this.size = rules.size;
    Object.freeze(this);
  }

  get(canonicalPath: string): MergeStrategy | undefined {
    return this.#rules.get(canonicalPath);
  }

  has(canonicalPath: string): boolean {
    return this.#rules.has(canonicalPath);
  }
}

/** Builds an immutable index and rejects duplicate normalized paths. */
export function createMergeRuleIndex(
  declarations: readonly MergeRule[],
): MergeRuleIndex {
  const rules = new Map<string, MergeStrategy>();

  for (const declaration of declarations) {
    const path = canonicalizeRulePath(declaration.path);
    if (!isMergeStrategy(declaration.strategy)) {
      return invalidRule('invalid-merge-strategy', path);
    }
    if (rules.has(path)) return invalidRule('duplicate-merge-rule', path);
    rules.set(path, declaration.strategy);
  }

  return new ExactMergeRuleIndex(rules);
}
