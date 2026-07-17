import { isProxy } from 'node:util/types';

export type SafeDataProperty =
  | Readonly<{ kind: 'absent' }>
  | Readonly<{ kind: 'data'; value: unknown }>
  | Readonly<{ kind: 'unsafe' }>;

/** Reads only an own data property and never invokes an accessor or proxy trap. */
export function readSafeDataProperty(
  value: unknown,
  property: PropertyKey,
): SafeDataProperty {
  if (
    ((typeof value !== 'object' || value === null) &&
      typeof value !== 'function') ||
    isProxy(value)
  ) {
    return { kind: 'unsafe' };
  }

  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, property);
    if (descriptor === undefined) return { kind: 'absent' };
    return 'value' in descriptor
      ? { kind: 'data', value: descriptor.value }
      : { kind: 'unsafe' };
  } catch {
    return { kind: 'unsafe' };
  }
}

/** Array detection that rejects proxies and revoked/uninspectable objects. */
export function isSafeDataArray(value: unknown): value is readonly unknown[] {
  if (typeof value !== 'object' || value === null || isProxy(value)) {
    return false;
  }
  try {
    return Array.isArray(value);
  } catch {
    return false;
  }
}
