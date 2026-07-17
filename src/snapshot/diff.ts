import { safeDiagnosticValue } from '../diagnostics/safe-json.js';
import type { DiagnosticValue } from '../diagnostics/safe-json.js';
import type { ConfigNode, ConfigObject } from '../normalize/types.js';
import { resolvePath, serializePath } from '../paths/index.js';
import { resolveOriginRecord } from '../provenance/origin.js';
import type { LayerRegistry } from '../provenance/registry.js';
import { createProvenanceTree, getProvenanceNode } from '../provenance/tree.js';
import type { ProvenanceNode, ProvenanceTree } from '../provenance/tree.js';
import { fingerprintSecretValue } from '../secrets/fingerprint.js';
import type {
  FingerprintKey,
  SecretFingerprint,
} from '../secrets/fingerprint.js';

export type ConfigChangeType =
  | 'added'
  | 'removed'
  | 'source-changed'
  | 'value-and-source-changed'
  | 'value-changed';

export interface AvailableDiffSource {
  readonly available: true;
  readonly kind: string;
  readonly name: string;
  readonly reference?: string;
}

export interface UnavailableDiffSource {
  readonly available: false;
}

export type DiffSource = AvailableDiffSource | UnavailableDiffSource;

export interface ConfigDiffSide {
  readonly fingerprint?: SecretFingerprint;
  readonly source: DiffSource;
  readonly value: DiagnosticValue;
}

interface ConfigChangeBase {
  readonly path: string;
  readonly type: ConfigChangeType;
}

export interface AddedConfigChange extends ConfigChangeBase {
  readonly after: ConfigDiffSide;
  readonly type: 'added';
}

export interface RemovedConfigChange extends ConfigChangeBase {
  readonly before: ConfigDiffSide;
  readonly type: 'removed';
}

export interface ValueChangedConfigChange extends ConfigChangeBase {
  readonly after: ConfigDiffSide;
  readonly before: ConfigDiffSide;
  readonly type: 'value-changed';
}

export interface SourceChangedConfigChange extends ConfigChangeBase {
  readonly after: ConfigDiffSide;
  readonly before: ConfigDiffSide;
  readonly type: 'source-changed';
}

export interface ValueAndSourceChangedConfigChange extends ConfigChangeBase {
  readonly after: ConfigDiffSide;
  readonly before: ConfigDiffSide;
  readonly type: 'value-and-source-changed';
}

export type ConfigChange =
  | AddedConfigChange
  | RemovedConfigChange
  | SourceChangedConfigChange
  | ValueAndSourceChangedConfigChange
  | ValueChangedConfigChange;

export interface ConfigDiff {
  readonly changes: readonly ConfigChange[];
}

export type SecretFingerprintIndex = ReadonlyMap<string, SecretFingerprint>;

export interface SnapshotDiffInput {
  readonly fingerprints?: SecretFingerprintIndex;
  readonly provenance?: ProvenanceTree;
  readonly redactedValue?: ConfigNode;
  readonly registry?: LayerRegistry;
  readonly value: ConfigNode;
}

const SOURCE_UNAVAILABLE: UnavailableDiffSource = Object.freeze({
  available: false,
});

function isObjectNode(value: ConfigNode): value is ConfigObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nodesEqual(left: ConfigNode, right: ConfigNode): boolean {
  if (left === right) return true;
  if (
    typeof left !== 'object' ||
    left === null ||
    typeof right !== 'object' ||
    right === null
  ) {
    return false;
  }
  const leftArray = Array.isArray(left);
  if (leftArray !== Array.isArray(right)) return false;
  if (leftArray) {
    const rightArray = right as ConfigNode[];
    return (
      left.length === rightArray.length &&
      left.every((value, index) =>
        nodesEqual(value, rightArray[index] as ConfigNode),
      )
    );
  }

  const leftKeys = Object.keys(left);
  const rightObject = right as ConfigObject;
  const rightKeys = Object.keys(rightObject);
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key) =>
        Object.prototype.hasOwnProperty.call(rightObject, key) &&
        nodesEqual(left[key] as ConfigNode, rightObject[key] as ConfigNode),
    )
  );
}

function isDiagnosticArray(
  value: DiagnosticValue,
): value is readonly DiagnosticValue[] {
  return Array.isArray(value);
}

function freezeDiagnostic(value: DiagnosticValue): DiagnosticValue {
  if (typeof value !== 'object' || value === null) return value;
  if (isDiagnosticArray(value)) {
    for (const child of value) freezeDiagnostic(child);
    return Object.freeze(value);
  }
  for (const child of Object.values(value)) freezeDiagnostic(child);
  return Object.freeze(value);
}

function provenanceNode(
  input: SnapshotDiffInput,
  segments: readonly string[],
): ProvenanceNode | undefined {
  return input.provenance === undefined
    ? undefined
    : getProvenanceNode(input.provenance, segments);
}

function sourceAt(
  input: SnapshotDiffInput,
  segments: readonly string[],
): DiffSource {
  const node = provenanceNode(input, segments);
  if (node?.state !== 'value' || input.registry === undefined) {
    return SOURCE_UNAVAILABLE;
  }

  const origin = resolveOriginRecord(input.registry, node.current);
  const reference = origin.inputReference ?? origin.sourceReference;
  return Object.freeze({
    available: true,
    kind: origin.layer.kind,
    name: origin.layer.name,
    ...(reference === undefined ? {} : { reference }),
  });
}

function safeValueAt(
  input: SnapshotDiffInput,
  rawValue: ConfigNode,
  segments: readonly string[],
): DiagnosticValue {
  if (input.redactedValue !== undefined) {
    const resolution = resolvePath(input.redactedValue, segments);
    if (resolution.found && resolution.value !== undefined) {
      return freezeDiagnostic(safeDiagnosticValue(resolution.value));
    }
  }

  const node = provenanceNode(input, segments);
  return freezeDiagnostic(
    safeDiagnosticValue(
      rawValue,
      node === undefined || input.provenance === undefined
        ? {}
        : {
            provenance: createProvenanceTree(node, input.provenance.mode),
          },
    ),
  );
}

function diffSide(
  input: SnapshotDiffInput,
  value: ConfigNode,
  segments: readonly string[],
): ConfigDiffSide {
  const fingerprint = input.fingerprints?.get(serializePath(segments));
  return Object.freeze({
    ...(fingerprint === undefined ? {} : { fingerprint }),
    source: sourceAt(input, segments),
    value: safeValueAt(input, value, segments),
  });
}

type SourceComparison = 'different' | 'same' | 'unavailable';

function compareSources(left: DiffSource, right: DiffSource): SourceComparison {
  if (!left.available || !right.available) return 'unavailable';
  return left.kind === right.kind &&
    left.name === right.name &&
    left.reference === right.reference
    ? 'same'
    : 'different';
}

function childNode(
  node: ProvenanceNode | undefined,
  segment: string,
): ProvenanceNode | undefined {
  return node?.state === 'value' && node.kind !== 'leaf'
    ? node.children.get(segment)
    : undefined;
}

/** Computes current secret digests while the fingerprint key is in scope. */
export function createSecretFingerprintIndex(
  value: ConfigNode,
  provenance: ProvenanceTree | undefined,
  fingerprintKey?: FingerprintKey,
): SecretFingerprintIndex {
  const fingerprints = new Map<string, SecretFingerprint>();

  function visit(
    currentValue: ConfigNode,
    currentProvenance: ProvenanceNode | undefined,
    segments: readonly string[],
  ): void {
    if (currentProvenance?.secret === true) {
      fingerprints.set(
        serializePath(segments),
        fingerprintSecretValue(currentValue, fingerprintKey),
      );
    }
    if (typeof currentValue !== 'object' || currentValue === null) return;

    if (Array.isArray(currentValue)) {
      for (let index = 0; index < currentValue.length; index += 1) {
        const segment = String(index);
        visit(
          currentValue[index] as ConfigNode,
          childNode(currentProvenance, segment),
          [...segments, segment],
        );
      }
      return;
    }

    for (const key of Object.keys(currentValue).sort()) {
      visit(
        currentValue[key] as ConfigNode,
        childNode(currentProvenance, key),
        [...segments, key],
      );
    }
  }

  visit(value, provenance?.root, []);
  return fingerprints;
}

/** Compares validated normalized values without mutating either snapshot. */
export function createConfigDiff(
  beforeInput: SnapshotDiffInput,
  afterInput: SnapshotDiffInput,
): ConfigDiff {
  const changes: ConfigChange[] = [];

  function addValue(
    value: ConfigNode,
    input: SnapshotDiffInput,
    segments: readonly string[],
  ): void {
    if (isObjectNode(value)) {
      const keys = Object.keys(value).sort();
      if (keys.length > 0) {
        for (const key of keys) {
          addValue(value[key] as ConfigNode, input, [...segments, key]);
        }
        return;
      }
    }
    changes.push(
      Object.freeze({
        after: diffSide(input, value, segments),
        path: serializePath(segments),
        type: 'added',
      }),
    );
  }

  function removeValue(
    value: ConfigNode,
    input: SnapshotDiffInput,
    segments: readonly string[],
  ): void {
    if (isObjectNode(value)) {
      const keys = Object.keys(value).sort();
      if (keys.length > 0) {
        for (const key of keys) {
          removeValue(value[key] as ConfigNode, input, [...segments, key]);
        }
        return;
      }
    }
    changes.push(
      Object.freeze({
        before: diffSide(input, value, segments),
        path: serializePath(segments),
        type: 'removed',
      }),
    );
  }

  function compareValue(
    before: ConfigNode,
    after: ConfigNode,
    segments: readonly string[],
  ): void {
    if (isObjectNode(before) && isObjectNode(after)) {
      const keys = [
        ...new Set([...Object.keys(before), ...Object.keys(after)]),
      ].sort();
      if (keys.length > 0) {
        for (const key of keys) {
          const beforeHas = Object.prototype.hasOwnProperty.call(before, key);
          const afterHas = Object.prototype.hasOwnProperty.call(after, key);
          if (beforeHas && afterHas) {
            compareValue(before[key] as ConfigNode, after[key] as ConfigNode, [
              ...segments,
              key,
            ]);
          } else if (beforeHas) {
            removeValue(before[key] as ConfigNode, beforeInput, [
              ...segments,
              key,
            ]);
          } else if (afterHas) {
            addValue(after[key] as ConfigNode, afterInput, [...segments, key]);
          }
        }
        return;
      }
    }

    const beforeSide = diffSide(beforeInput, before, segments);
    const afterSide = diffSide(afterInput, after, segments);
    const valueChanged = !nodesEqual(before, after);
    const sourceComparison = compareSources(
      beforeSide.source,
      afterSide.source,
    );
    if (!valueChanged && sourceComparison !== 'different') return;

    const type: ConfigChangeType = valueChanged
      ? sourceComparison === 'different'
        ? 'value-and-source-changed'
        : 'value-changed'
      : 'source-changed';
    changes.push(
      Object.freeze({
        after: afterSide,
        before: beforeSide,
        path: serializePath(segments),
        type,
      }),
    );
  }

  compareValue(beforeInput.value, afterInput.value, []);
  changes.sort((left, right) =>
    left.path < right.path ? -1 : left.path > right.path ? 1 : 0,
  );
  return Object.freeze({ changes: Object.freeze(changes) });
}
