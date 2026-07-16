/**
 * Reports whether a value has exactly `Object.prototype` or `null` as its
 * prototype. Proxy traps are trusted executable code and may run here.
 */
export function isPlainObject(
  value: unknown,
): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false;

  try {
    const prototype: unknown = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch {
    return false;
  }
}
