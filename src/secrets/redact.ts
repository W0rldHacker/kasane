import type { ProvenanceNode, ProvenanceTree } from '../provenance/tree.js';
import type { SecretPathMatcher } from './matcher.js';

export const REDACTED_VALUE = '[REDACTED]';

const CIRCULAR_VALUE = '[CIRCULAR]';
const REMOVED_VALUE = '[REMOVED]';
const TRUNCATED_VALUE = '[TRUNCATED]';
const UNINSPECTABLE_VALUE = '[UNINSPECTABLE]';
const UNSUPPORTED_VALUE = '[UNSUPPORTED]';

export type DiagnosticPrimitive = boolean | null | number | string;

export interface DiagnosticObject {
  readonly [key: string]: DiagnosticValue;
}

export type DiagnosticValue =
  DiagnosticObject | DiagnosticPrimitive | readonly DiagnosticValue[];

export interface RedactionContext {
  readonly policy?: SecretPathMatcher;
  readonly provenance?: ProvenanceTree;
}

export interface RedactorLimits {
  readonly maxArrayLength?: number;
  readonly maxDepth?: number;
  readonly maxObjectKeys?: number;
  readonly maxStringLength?: number;
  readonly maxVisitedNodes?: number;
  /** Platform adapter used to reject proxies before reflective traversal. */
  readonly unsafeObject?: (value: object) => boolean;
}

interface ResolvedRedactorLimits {
  readonly maxArrayLength: number;
  readonly maxDepth: number;
  readonly maxObjectKeys: number;
  readonly maxStringLength: number;
  readonly maxVisitedNodes: number;
}

interface TraversalState {
  readonly active: Set<object>;
  nodes: number;
}

const DEFAULT_LIMITS: ResolvedRedactorLimits = {
  maxArrayLength: 1_000,
  maxDepth: 64,
  maxObjectKeys: 1_000,
  maxStringLength: 100_000,
  maxVisitedNodes: 10_000,
};

function boundedInteger(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isSafeInteger(value) && value >= 0
    ? value
    : fallback;
}

function appendPath(path: string, segment: string): string {
  const escaped = segment.replaceAll('\\', '\\\\').replaceAll('.', '\\.');
  return path.length === 0 ? escaped : `${path}.${escaped}`;
}

function childProvenance(
  provenance: ProvenanceNode | undefined,
  segment: string,
): ProvenanceNode | undefined {
  return provenance?.state === 'value' && provenance.kind !== 'leaf'
    ? provenance.children.get(segment)
    : undefined;
}

function safePolicyMatch(
  policy: SecretPathMatcher | undefined,
  path: string,
): boolean {
  if (policy === undefined) return false;

  try {
    return policy.matches(path);
  } catch {
    return true;
  }
}

function ownDataDescriptor(
  value: object,
  key: PropertyKey,
): PropertyDescriptor | undefined | null {
  try {
    return Reflect.getOwnPropertyDescriptor(value, key);
  } catch {
    return null;
  }
}

function ownEnumerableStringKeys(value: object): readonly string[] | null {
  try {
    return Reflect.ownKeys(value)
      .filter((key): key is string => typeof key === 'string')
      .filter((key) => ownDataDescriptor(value, key)?.enumerable === true)
      .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
  } catch {
    return null;
  }
}

function detachedObject(): Record<string, DiagnosticValue> {
  return Object.create(null) as Record<string, DiagnosticValue>;
}

function isUnsafeObject(
  detector: ((value: object) => boolean) | undefined,
  value: object,
): boolean {
  if (detector === undefined) return false;
  try {
    return detector(value);
  } catch {
    return true;
  }
}

/** The only structural conversion from internal data to diagnostic-safe data. */
export class Redactor {
  readonly #limits: ResolvedRedactorLimits;
  readonly #unsafeObject: ((value: object) => boolean) | undefined;

  constructor(limits: RedactorLimits = {}) {
    this.#limits = {
      maxArrayLength: boundedInteger(
        limits.maxArrayLength,
        DEFAULT_LIMITS.maxArrayLength,
      ),
      maxDepth: boundedInteger(limits.maxDepth, DEFAULT_LIMITS.maxDepth),
      maxObjectKeys: boundedInteger(
        limits.maxObjectKeys,
        DEFAULT_LIMITS.maxObjectKeys,
      ),
      maxStringLength: boundedInteger(
        limits.maxStringLength,
        DEFAULT_LIMITS.maxStringLength,
      ),
      maxVisitedNodes: boundedInteger(
        limits.maxVisitedNodes,
        DEFAULT_LIMITS.maxVisitedNodes,
      ),
    };
    this.#unsafeObject = limits.unsafeObject;
  }

  redact(value: unknown, context: RedactionContext = {}): DiagnosticValue {
    return this.#visit(
      value,
      context.provenance?.root,
      context.policy,
      '',
      false,
      false,
      0,
      { active: new Set<object>(), nodes: 0 },
    );
  }

  /** Redacts normalized merge data without retaining provenance metadata. */
  redactNormalized(
    value: unknown,
    policy: SecretPathMatcher,
    preserve: (value: unknown) => boolean,
  ): unknown {
    return this.#visitNormalized(value, policy, preserve, '');
  }

  #visitNormalized(
    value: unknown,
    policy: SecretPathMatcher,
    preserve: (value: unknown) => boolean,
    path: string,
  ): unknown {
    if (preserve(value)) return value;
    const secret = safePolicyMatch(policy, path);
    if (value === null || typeof value !== 'object') {
      return secret ? REDACTED_VALUE : value;
    }

    if (Array.isArray(value)) {
      return value.map((child, index) =>
        this.#visitNormalized(
          child,
          policy,
          preserve,
          appendPath(path, String(index)),
        ),
      );
    }

    const output: Record<string, unknown> = Object.create(null) as Record<
      string,
      unknown
    >;
    for (const key of Object.keys(value)) {
      Object.defineProperty(output, key, {
        configurable: true,
        enumerable: true,
        value: this.#visitNormalized(
          (value as Record<string, unknown>)[key],
          policy,
          preserve,
          appendPath(path, key),
        ),
        writable: true,
      });
    }
    return output;
  }

  #visit(
    value: unknown,
    provenance: ProvenanceNode | undefined,
    policy: SecretPathMatcher | undefined,
    path: string,
    inheritedSecret: boolean,
    inheritedPolicy: boolean,
    depth: number,
    traversal: TraversalState,
  ): DiagnosticValue {
    traversal.nodes += 1;
    if (traversal.nodes > this.#limits.maxVisitedNodes) return TRUNCATED_VALUE;

    const valueSecret = provenance?.secret ?? inheritedSecret;
    const policySecret = inheritedPolicy || safePolicyMatch(policy, path);
    const secret = valueSecret || policySecret;

    if (provenance?.state === 'tombstone') {
      return secret ? REDACTED_VALUE : REMOVED_VALUE;
    }

    if (value === null || typeof value !== 'object') {
      if (secret) return REDACTED_VALUE;

      switch (typeof value) {
        case 'boolean':
          return value;
        case 'number':
          return Number.isFinite(value) ? value : UNSUPPORTED_VALUE;
        case 'string':
          return value.length <= this.#limits.maxStringLength
            ? value
            : `${value.slice(0, this.#limits.maxStringLength)}${TRUNCATED_VALUE}`;
        case 'object':
          return null;
        default:
          return UNSUPPORTED_VALUE;
      }
    }

    if (depth >= this.#limits.maxDepth) return TRUNCATED_VALUE;
    if (isUnsafeObject(this.#unsafeObject, value)) return UNINSPECTABLE_VALUE;
    if (traversal.active.has(value)) return CIRCULAR_VALUE;
    traversal.active.add(value);

    try {
      let array = false;
      try {
        array = Array.isArray(value);
      } catch {
        return UNINSPECTABLE_VALUE;
      }

      return array
        ? this.#visitArray(
            value,
            provenance,
            policy,
            path,
            valueSecret,
            policySecret,
            depth,
            traversal,
          )
        : this.#visitObject(
            value,
            provenance,
            policy,
            path,
            valueSecret,
            policySecret,
            depth,
            traversal,
          );
    } finally {
      traversal.active.delete(value);
    }
  }

  #visitArray(
    value: object,
    provenance: ProvenanceNode | undefined,
    policy: SecretPathMatcher | undefined,
    path: string,
    inheritedSecret: boolean,
    inheritedPolicy: boolean,
    depth: number,
    traversal: TraversalState,
  ): DiagnosticValue {
    const lengthDescriptor = ownDataDescriptor(value, 'length');
    if (
      lengthDescriptor === null ||
      lengthDescriptor === undefined ||
      !('value' in lengthDescriptor)
    ) {
      return UNINSPECTABLE_VALUE;
    }

    const rawLength: unknown = lengthDescriptor.value;
    if (
      typeof rawLength !== 'number' ||
      !Number.isSafeInteger(rawLength) ||
      rawLength < 0
    ) {
      return UNINSPECTABLE_VALUE;
    }

    const length = Math.min(rawLength, this.#limits.maxArrayLength);
    const output: DiagnosticValue[] = [];
    for (let index = 0; index < length; index += 1) {
      const segment = String(index);
      const descriptor = ownDataDescriptor(value, segment);
      output.push(
        descriptor !== null && descriptor !== undefined && 'value' in descriptor
          ? this.#visit(
              descriptor.value,
              childProvenance(provenance, segment),
              policy,
              appendPath(path, segment),
              inheritedSecret,
              inheritedPolicy,
              depth + 1,
              traversal,
            )
          : descriptor === null
            ? UNINSPECTABLE_VALUE
            : UNSUPPORTED_VALUE,
      );
    }
    if (rawLength > length) output.push(TRUNCATED_VALUE);
    return output;
  }

  #visitObject(
    value: object,
    provenance: ProvenanceNode | undefined,
    policy: SecretPathMatcher | undefined,
    path: string,
    inheritedSecret: boolean,
    inheritedPolicy: boolean,
    depth: number,
    traversal: TraversalState,
  ): DiagnosticValue {
    const keys = ownEnumerableStringKeys(value);
    if (keys === null) return UNINSPECTABLE_VALUE;

    const output = detachedObject();
    const length = Math.min(keys.length, this.#limits.maxObjectKeys);
    for (let index = 0; index < length; index += 1) {
      const key = keys[index];
      if (key === undefined) continue;

      const descriptor = ownDataDescriptor(value, key);
      const child =
        descriptor !== null && descriptor !== undefined && 'value' in descriptor
          ? this.#visit(
              descriptor.value,
              childProvenance(provenance, key),
              policy,
              appendPath(path, key),
              inheritedSecret,
              inheritedPolicy,
              depth + 1,
              traversal,
            )
          : UNINSPECTABLE_VALUE;
      Object.defineProperty(output, key, {
        configurable: true,
        enumerable: true,
        value: child,
        writable: true,
      });
    }
    if (keys.length > length) {
      Object.defineProperty(output, TRUNCATED_VALUE, {
        configurable: true,
        enumerable: true,
        value: keys.length - length,
        writable: true,
      });
    }
    return output;
  }
}
