import type { ConfigPrimitive } from '../normalize/types.js';
import type { SecretFingerprint } from '../secrets/fingerprint.js';
import type {
  LeafOriginRecord,
  RemoveOriginRecord,
  StructuralOriginRecord,
} from './origin.js';

export type ProvenanceMode = 'none' | 'origin-only' | 'full';
export type StoredProvenanceMode = Exclude<ProvenanceMode, 'none'>;

export const DEFAULT_PROVENANCE_MODE: ProvenanceMode = 'origin-only';

/** A detached non-secret leaf snapshot. Containers are never stored here. */
export interface ValueHistoryEntry {
  readonly kind: 'value';
  readonly origin: LeafOriginRecord;
  readonly value: ConfigPrimitive;
}

/** Secret leaf attempt with no recoverable plaintext in provenance metadata. */
export interface RedactedHistoryEntry {
  readonly kind: 'redacted';
  readonly origin: LeafOriginRecord;
  readonly redacted: true;
  readonly fingerprint: SecretFingerprint;
}

/** Structural and removal attempts deliberately contain no value snapshot. */
export interface OperationHistoryEntry {
  readonly kind: 'operation';
  readonly origin: StructuralOriginRecord | RemoveOriginRecord;
}

export type OriginHistoryEntry =
  ValueHistoryEntry | RedactedHistoryEntry | OperationHistoryEntry;
export type OriginHistory = readonly OriginHistoryEntry[];

export type HistoryFingerprinter = (
  value: ConfigPrimitive,
) => SecretFingerprint;

export function createLeafHistoryEntry(
  origin: LeafOriginRecord,
  value: ConfigPrimitive,
  fingerprint: HistoryFingerprinter,
): ValueHistoryEntry | RedactedHistoryEntry {
  return origin.secret
    ? Object.freeze({
        fingerprint: fingerprint(value),
        kind: 'redacted',
        origin,
        redacted: true,
      })
    : Object.freeze({ kind: 'value', origin, value });
}

export function createOperationHistoryEntry(
  origin: StructuralOriginRecord | RemoveOriginRecord,
): OperationHistoryEntry {
  return Object.freeze({ kind: 'operation', origin });
}

export function appendHistoryEntry(
  previous: OriginHistory | undefined,
  entry: OriginHistoryEntry,
): OriginHistory {
  return Object.freeze([...(previous ?? []), entry]);
}

/**
 * Used when a later annotation makes a path secret. Every detached plaintext
 * snapshot is replaced immediately; origins and ordering remain available.
 */
export function redactHistory(
  history: OriginHistory,
  fingerprint: HistoryFingerprinter,
): OriginHistory {
  if (!history.some((entry) => entry.kind === 'value')) return history;

  return Object.freeze(
    history.map((entry): OriginHistoryEntry => {
      if (entry.kind !== 'value') return entry;
      return Object.freeze({
        fingerprint: fingerprint(entry.value),
        kind: 'redacted',
        origin: entry.origin,
        redacted: true,
      });
    }),
  );
}
