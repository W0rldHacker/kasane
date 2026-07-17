declare const secretValueBrand: unique symbol;

/** Opaque value annotation consumed and removed before normalization. */
export interface SecretValue<Value = unknown> {
  readonly [secretValueBrand]: Value;
}

export interface UnwrappedSecretValue {
  readonly value: unknown;
}

const values = new WeakMap<object, unknown>();

/** Marks one value subtree as secret without changing its normalized value. */
export function secretValue<Value>(value: Value): SecretValue<Value> {
  const marker = Object.freeze({});
  values.set(marker, value);
  return marker as SecretValue<Value>;
}

/** Internal identity-based unwrap; marker payload is never an object property. */
export function unwrapSecretValue(
  value: unknown,
): UnwrappedSecretValue | undefined {
  if (typeof value !== 'object' || value === null || !values.has(value)) {
    return undefined;
  }
  return { value: values.get(value) };
}
