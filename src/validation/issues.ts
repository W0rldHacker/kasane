import {
  isSafeDataArray,
  readSafeDataProperty,
} from '../diagnostics/safe-data.js';
import {
  safeDiagnosticValue,
  safeRedactedValue,
} from '../diagnostics/safe-json.js';
import type { DiagnosticValue } from '../diagnostics/safe-json.js';
import type { ConfigNode } from '../normalize/types.js';
import { isSafeConfigKey } from '../normalize/safe-key.js';
import {
  MAX_PATH_LENGTH,
  MAX_PATH_SEGMENTS,
  resolvePath,
  serializePath,
} from '../paths/index.js';
import type { Origin } from '../provenance/explanation.js';
import type { OriginHistoryEntry } from '../provenance/history.js';
import { resolveOriginRecord } from '../provenance/origin.js';
import type { LayerRegistry } from '../provenance/registry.js';
import { createProvenanceTree, getProvenanceNode } from '../provenance/tree.js';
import type { ProvenanceNode, ProvenanceTree } from '../provenance/tree.js';
import { fingerprintSecretValue } from '../secrets/fingerprint.js';
import type {
  FingerprintKey,
  SecretFingerprint,
} from '../secrets/fingerprint.js';

const SAFE_REASON = 'Validation constraint was not satisfied.';
const MAX_ISSUES = 1_000;

export interface ConfigIssuePrevious {
  readonly fingerprint?: SecretFingerprint;
  readonly origin: Origin;
  readonly value: DiagnosticValue;
}

/** One deterministic, provenance-aware and serialization-safe issue. */
export interface ConfigIssue {
  readonly path: string;
  readonly pathDescription?: string;
  readonly previous?: ConfigIssuePrevious;
  readonly reason: string;
  readonly received?: DiagnosticValue;
  readonly receivedFingerprint?: SecretFingerprint;
  readonly source?: Origin;
}

export interface ConfigIssueContext {
  readonly fingerprintKey?: FingerprintKey;
  /** `none` keeps provenance internal for redaction but omits public source. */
  readonly includeSource: boolean;
  readonly provenance: ProvenanceTree;
  readonly registry: LayerRegistry;
  readonly value: ConfigNode | undefined;
}

interface NormalizedIssuePath {
  readonly description?: string;
  readonly path: string;
  readonly segments: readonly string[];
}

function rootPath(description?: string): NormalizedIssuePath {
  return {
    path: '',
    segments: Object.freeze([]),
    ...(description === undefined ? {} : { description }),
  };
}

function unsupportedSegment(index: number, kind: string): NormalizedIssuePath {
  return rootPath(
    `Unsupported validation issue path segment at index ${String(index)} (${kind}).`,
  );
}

function segmentKind(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return 'string';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'symbol') return 'symbol';
  if (typeof value === 'bigint') return 'bigint';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'undefined') return 'undefined';
  if (typeof value === 'function') return 'function';
  return 'object';
}

function normalizeSegment(
  rawSegment: unknown,
): Readonly<{ description?: string; segment?: string }> {
  let segment = rawSegment;
  if (typeof segment === 'object' && segment !== null) {
    const key = readSafeDataProperty(segment, 'key');
    if (key.kind !== 'data') {
      return { description: `uninspectable-${segmentKind(segment)}` };
    }
    segment = key.value;
  }

  if (typeof segment === 'number') {
    return Number.isSafeInteger(segment) && segment >= 0
      ? { segment: String(segment) }
      : { description: 'unsafe-number' };
  }
  if (
    typeof segment !== 'string' ||
    segment.length === 0 ||
    segment.length > MAX_PATH_LENGTH ||
    !isSafeConfigKey(segment)
  ) {
    return { description: segmentKind(segment) };
  }
  return { segment };
}

function normalizeIssuePath(rawPath: unknown): NormalizedIssuePath {
  if (rawPath === undefined) return rootPath();
  if (!isSafeDataArray(rawPath)) {
    return rootPath('Unsupported validation issue path (non-array).');
  }

  const length = readSafeDataProperty(rawPath, 'length');
  if (
    length.kind !== 'data' ||
    typeof length.value !== 'number' ||
    !Number.isSafeInteger(length.value) ||
    length.value < 0 ||
    length.value > MAX_PATH_SEGMENTS
  ) {
    return rootPath('Unsupported validation issue path (invalid length).');
  }

  const segments: string[] = [];
  for (let index = 0; index < length.value; index += 1) {
    const rawSegment = readSafeDataProperty(rawPath, String(index));
    if (rawSegment.kind !== 'data') {
      return unsupportedSegment(index, rawSegment.kind);
    }
    const normalized = normalizeSegment(rawSegment.value);
    if (normalized.segment === undefined) {
      return unsupportedSegment(
        index,
        normalized.description ?? segmentKind(rawSegment.value),
      );
    }
    segments.push(normalized.segment);
  }

  try {
    return {
      path: serializePath(segments),
      segments: Object.freeze(segments),
    };
  } catch {
    return rootPath('Unsupported validation issue path (outside limits).');
  }
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

function diagnosticValue(
  value: ConfigNode,
  node: ProvenanceNode | undefined,
  mode: ProvenanceTree['mode'],
): DiagnosticValue {
  return freezeDiagnostic(
    safeDiagnosticValue(
      value,
      node === undefined
        ? {}
        : { provenance: createProvenanceTree(node, mode) },
    ),
  );
}

function previousEntry(node: ProvenanceNode): OriginHistoryEntry | undefined {
  if (node.state !== 'value' || node.history === undefined) return undefined;
  for (let index = node.history.length - 2; index >= 0; index -= 1) {
    const entry = node.history[index];
    if (entry?.kind === 'value' || entry?.kind === 'redacted') return entry;
  }
  return undefined;
}

function previousDiagnostic(
  node: ProvenanceNode,
  context: ConfigIssueContext,
): ConfigIssuePrevious | undefined {
  if (context.provenance.mode !== 'full') return undefined;
  const entry = previousEntry(node);
  if (entry === undefined || entry.kind === 'operation') return undefined;

  const origin = resolveOriginRecord(context.registry, entry.origin);
  if (entry.kind === 'redacted') {
    return Object.freeze({
      fingerprint: entry.fingerprint,
      origin,
      value: safeRedactedValue(),
    });
  }
  return Object.freeze({
    origin,
    value: freezeDiagnostic(safeDiagnosticValue(entry.value)),
  });
}

function createIssue(
  normalizedPath: NormalizedIssuePath,
  context: ConfigIssueContext,
): ConfigIssue {
  const node = getProvenanceNode(context.provenance, normalizedPath.segments);
  const valueResolution =
    context.value === undefined
      ? undefined
      : resolvePath(context.value, normalizedPath.segments);
  const source =
    context.includeSource && node?.state === 'value'
      ? resolveOriginRecord(context.registry, node.current)
      : undefined;
  const previous =
    context.includeSource && node !== undefined
      ? previousDiagnostic(node, context)
      : undefined;
  const received =
    valueResolution?.found === true && valueResolution.value !== undefined
      ? diagnosticValue(valueResolution.value, node, context.provenance.mode)
      : undefined;
  const receivedFingerprint =
    valueResolution?.found === true &&
    valueResolution.value !== undefined &&
    node?.secret === true
      ? fingerprintSecretValue(valueResolution.value, context.fingerprintKey)
      : undefined;

  return Object.freeze({
    path: normalizedPath.path,
    ...(normalizedPath.description === undefined
      ? {}
      : { pathDescription: normalizedPath.description }),
    ...(previous === undefined ? {} : { previous }),
    reason: SAFE_REASON,
    ...(received === undefined ? {} : { received }),
    ...(receivedFingerprint === undefined ? {} : { receivedFingerprint }),
    ...(source === undefined ? {} : { source }),
  });
}

function compareIssues(left: ConfigIssue, right: ConfigIssue): number {
  if (left.path < right.path) return -1;
  if (left.path > right.path) return 1;
  const leftDescription = left.pathDescription ?? '';
  const rightDescription = right.pathDescription ?? '';
  return leftDescription < rightDescription
    ? -1
    : leftDescription > rightDescription
      ? 1
      : 0;
}

/** Converts untrusted Standard Schema issues without copying their messages. */
export function normalizeStandardSchemaIssues(
  rawIssues: unknown,
  context: ConfigIssueContext,
): readonly ConfigIssue[] | undefined {
  if (!isSafeDataArray(rawIssues)) return undefined;
  const length = readSafeDataProperty(rawIssues, 'length');
  if (
    length.kind !== 'data' ||
    typeof length.value !== 'number' ||
    !Number.isSafeInteger(length.value) ||
    length.value < 0 ||
    length.value > MAX_ISSUES
  ) {
    return undefined;
  }

  const issues: ConfigIssue[] = [];
  for (let index = 0; index < length.value; index += 1) {
    const rawIssue = readSafeDataProperty(rawIssues, String(index));
    if (rawIssue.kind !== 'data') return undefined;
    const rawPath = readSafeDataProperty(rawIssue.value, 'path');
    const path =
      rawPath.kind === 'data'
        ? normalizeIssuePath(rawPath.value)
        : rawPath.kind === 'absent'
          ? rootPath()
          : rootPath('Unsupported validation issue path (uninspectable).');
    issues.push(createIssue(path, context));
  }

  if (issues.length === 0) issues.push(createIssue(rootPath(), context));
  return Object.freeze(issues.sort(compareIssues));
}

export function createRootConfigIssue(
  context: ConfigIssueContext,
): readonly ConfigIssue[] {
  return Object.freeze([createIssue(rootPath(), context)]);
}
