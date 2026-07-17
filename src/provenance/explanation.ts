import type { ConfigNode } from '../normalize/types.js';
import { resolvePath, serializePath } from '../paths/index.js';
import type { PathResolution } from '../paths/index.js';
import type { DiagnosticValue } from '../secrets/redact.js';
import type { SecretFingerprint } from '../secrets/fingerprint.js';
import type { OriginHistory, OriginHistoryEntry } from './history.js';
import { resolveOriginRecord } from './origin.js';
import type { OriginRecord, ResolvedOriginRecord } from './origin.js';
import type { LayerRegistry } from './registry.js';
import type {
  ProvenanceNode,
  ProvenanceTree,
  TombstoneProvenanceNode,
} from './tree.js';
import { getProvenanceNode } from './tree.js';

export type Origin = ResolvedOriginRecord;

interface ExplanationHistoryBase {
  readonly origin: Origin;
}

export interface ExplanationValueHistoryEntry extends ExplanationHistoryBase {
  readonly kind: 'value';
  readonly value: DiagnosticValue;
}

export interface ExplanationRedactedHistoryEntry extends ExplanationHistoryBase {
  readonly fingerprint: SecretFingerprint;
  readonly kind: 'redacted';
  readonly redacted: true;
}

export interface ExplanationOperationHistoryEntry extends ExplanationHistoryBase {
  readonly kind: 'operation';
}

export type ExplanationHistoryEntry =
  | ExplanationOperationHistoryEntry
  | ExplanationRedactedHistoryEntry
  | ExplanationValueHistoryEntry;

export interface FoundExplanationData {
  readonly found: true;
  readonly history?: readonly ExplanationHistoryEntry[];
  readonly mixed?: boolean;
  readonly origin?: Origin;
  readonly path: string;
  readonly secret?: boolean;
  readonly value: DiagnosticValue;
}

export interface MissingExplanationData {
  readonly found: false;
  readonly history?: readonly ExplanationHistoryEntry[];
  readonly nearest: string;
  readonly path: string;
  readonly removal?: Origin;
  readonly secret?: boolean;
}

export type ExplanationData = FoundExplanationData | MissingExplanationData;

export interface ExplanationMethods {
  format(): string;
}

export type Explanation = ExplanationData & ExplanationMethods;

export interface CreateExplanationInput {
  readonly format: (explanation: ExplanationData) => string;
  readonly path: string;
  readonly provenance?: ProvenanceTree;
  readonly redact: (
    value: unknown,
    provenance: ProvenanceNode | undefined,
  ) => DiagnosticValue;
  readonly redactedResolution?: PathResolution;
  readonly registry?: LayerRegistry;
  readonly resolution: PathResolution;
  readonly root: ConfigNode;
  readonly segments: readonly string[];
}

interface RemovalMatch {
  readonly node: TombstoneProvenanceNode;
  readonly path: string;
}

function isDiagnosticArray(
  value: DiagnosticValue,
): value is readonly DiagnosticValue[] {
  return Array.isArray(value);
}

function freezeDiagnosticValue(value: DiagnosticValue): DiagnosticValue {
  if (typeof value !== 'object' || value === null) return value;
  if (isDiagnosticArray(value)) {
    for (const child of value) freezeDiagnosticValue(child);
    return Object.freeze(value);
  }

  for (const child of Object.values(value)) freezeDiagnosticValue(child);
  return Object.freeze(value);
}

function sameOrigin(left: OriginRecord, right: OriginRecord): boolean {
  return (
    left.inputReferenceId === right.inputReferenceId &&
    left.layerId === right.layerId &&
    left.operation === right.operation &&
    left.scope === right.scope &&
    left.secret === right.secret &&
    left.transformed === right.transformed
  );
}

/** Compares current value-bearing descendants, not the container touch itself. */
function hasMixedDescendants(node: ProvenanceNode): boolean {
  if (node.state === 'tombstone' || node.kind === 'leaf') return false;

  let first: OriginRecord | undefined;
  const pending = [...node.children.values()];
  while (pending.length > 0) {
    const child = pending.pop();
    if (child === undefined || child.state === 'tombstone') continue;

    if (child.kind !== 'leaf' && child.children.size > 0) {
      pending.push(...child.children.values());
      continue;
    }

    if (first === undefined) first = child.current;
    else if (!sameOrigin(first, child.current)) return true;
  }
  return false;
}

function resolveHistoryEntry(
  entry: OriginHistoryEntry,
  registry: LayerRegistry,
  redact: CreateExplanationInput['redact'],
): ExplanationHistoryEntry {
  const origin = resolveOriginRecord(registry, entry.origin);
  switch (entry.kind) {
    case 'operation':
      return Object.freeze({ kind: 'operation', origin });
    case 'redacted':
      return Object.freeze({
        fingerprint: entry.fingerprint,
        kind: 'redacted',
        origin,
        redacted: true,
      });
    case 'value':
      return Object.freeze({
        kind: 'value',
        origin,
        value: freezeDiagnosticValue(redact(entry.value, undefined)),
      });
  }
}

function resolveHistory(
  history: OriginHistory | undefined,
  registry: LayerRegistry,
  redact: CreateExplanationInput['redact'],
): readonly ExplanationHistoryEntry[] {
  return Object.freeze(
    (history ?? []).map((entry) =>
      resolveHistoryEntry(entry, registry, redact),
    ),
  );
}

function nearestExistingPath(
  root: ConfigNode,
  segments: readonly string[],
): string {
  let depth = 0;
  for (let length = 1; length <= segments.length; length += 1) {
    if (!resolvePath(root, segments.slice(0, length)).found) break;
    depth = length;
  }
  return serializePath(segments.slice(0, depth));
}

function nearestRemoval(
  tree: ProvenanceTree | undefined,
  segments: readonly string[],
): RemovalMatch | undefined {
  let node = tree?.root;
  if (node?.state === 'tombstone') return { node, path: '' };

  let depth = 0;
  for (const segment of segments) {
    if (node === undefined) return undefined;
    depth += 1;
    node =
      node.kind === 'leaf'
        ? node.removedChildren?.get(segment)
        : node.children.get(segment);
    if (node?.state === 'tombstone') {
      return {
        node,
        path: serializePath(segments.slice(0, depth)),
      };
    }
  }
  return undefined;
}

function attachFormatter(
  data: ExplanationData,
  formatter: CreateExplanationInput['format'],
): Explanation {
  Object.defineProperty(data, 'format', {
    configurable: false,
    enumerable: false,
    value: () => formatter(data),
    writable: false,
  });
  return Object.freeze(data) as Explanation;
}

export function resolvePathOrigin(
  segments: readonly string[],
  provenance: ProvenanceTree | undefined,
  registry: LayerRegistry | undefined,
): Origin | undefined {
  if (provenance === undefined || registry === undefined) return undefined;
  const node = getProvenanceNode(provenance, segments);
  return node?.state === 'value'
    ? resolveOriginRecord(registry, node.current)
    : undefined;
}

export function createExplanation(input: CreateExplanationInput): Explanation {
  const node = input.provenance
    ? getProvenanceNode(input.provenance, input.segments)
    : undefined;

  if (input.resolution.found) {
    const redactedValue =
      input.redactedResolution === undefined
        ? input.resolution.value
        : input.redactedResolution.found
          ? input.redactedResolution.value
          : undefined;
    const data: {
      found: true;
      history?: readonly ExplanationHistoryEntry[];
      mixed?: boolean;
      origin?: Origin;
      path: string;
      secret?: boolean;
      value: DiagnosticValue;
    } = {
      found: true,
      path: input.path,
      value: freezeDiagnosticValue(
        input.redact(
          redactedValue,
          input.redactedResolution === undefined ? node : undefined,
        ),
      ),
    };
    if (node?.state === 'value' && input.registry !== undefined) {
      data.origin = resolveOriginRecord(input.registry, node.current);
      data.secret = node.secret;
      if (node.kind !== 'leaf') data.mixed = hasMixedDescendants(node);
      if (input.provenance?.mode === 'full') {
        data.history = resolveHistory(
          node.history,
          input.registry,
          input.redact,
        );
      }
    }
    return attachFormatter(data, input.format);
  }

  const removal = nearestRemoval(input.provenance, input.segments);
  const data: {
    found: false;
    history?: readonly ExplanationHistoryEntry[];
    nearest: string;
    path: string;
    removal?: Origin;
    secret?: boolean;
  } = {
    found: false,
    nearest: removal?.path ?? nearestExistingPath(input.root, input.segments),
    path: input.path,
  };
  if (removal !== undefined && input.registry !== undefined) {
    data.removal = resolveOriginRecord(input.registry, removal.node.removal);
    data.secret = removal.node.secret;
    if (input.provenance?.mode === 'full') {
      data.history = resolveHistory(
        removal.node.history,
        input.registry,
        input.redact,
      );
    }
  }
  return attachFormatter(data, input.format);
}
