import type { remove } from '../../../src/index.js';
import type { MergeStrategy, ProvenanceMode } from '../../../src/index.js';

export type CanonicalPrimitive = null | boolean | number | string;

export type CanonicalNode =
  CanonicalPrimitive | CanonicalNode[] | CanonicalObject;

export interface CanonicalObject {
  [key: string]: CanonicalNode;
}

export type RemoveControl = typeof remove;

export type LayerNode =
  CanonicalPrimitive | CanonicalNode[] | LayerObject | RemoveControl;

export interface LayerObject {
  [key: string]: LayerNode | undefined;
}

export interface GeneratedLayer {
  readonly name: string;
  readonly value: LayerObject;
}

export interface GeneratedMergeCase {
  readonly layers: readonly GeneratedLayer[];
  readonly rules: Readonly<Record<string, MergeStrategy>>;
}

export const provenanceModes = [
  'none',
  'origin-only',
  'full',
] as const satisfies readonly ProvenanceMode[];

export function serializeTestPath(segments: readonly string[]): string {
  return segments
    .map((segment) => segment.replaceAll('\\', '\\\\').replaceAll('.', '\\.'))
    .join('.');
}

export function encodeFixture(value: unknown): unknown {
  if (value === undefined) return { $control: 'undefined' };
  if (typeof value === 'symbol') return { $control: String(value) };
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((item) => encodeFixture(item));

  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [
        key,
        encodeFixture((value as Record<string, unknown>)[key]),
      ]),
  );
}

export function fixtureDigest(value: unknown): string {
  return JSON.stringify(encodeFixture(value));
}
