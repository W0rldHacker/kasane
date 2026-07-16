import type { ConfigArray, ConfigPrimitive } from '../normalize/types.js';

/** Unique control marker for removing a root or object-property path. */
export const remove: unique symbol = Symbol('kasane.remove');

export type RemoveMarker = typeof remove;

/** A normalized layer may contain control markers only at object/root paths. */
export interface MergeLayerObject {
  readonly [key: string]: MergeLayerNode | undefined;
}

export type MergeLayerNode =
  ConfigPrimitive | ConfigArray | MergeLayerObject | RemoveMarker;

export function isRemoveMarker(value: unknown): value is RemoveMarker {
  return value === remove;
}
