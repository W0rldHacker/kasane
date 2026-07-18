import assert from 'node:assert/strict';

const objectPrototype = Object.prototype;
const baselinePrototype: object | null =
  Reflect.getPrototypeOf(objectPrototype);
const baselineKeys = Reflect.ownKeys(objectPrototype);
const baselineDescriptors = Object.getOwnPropertyDescriptors(objectPrototype);

/** Proves that one hostile case did not mutate the shared object prototype. */
export function assertObjectPrototypeInvariant(): void {
  assert.equal(Reflect.getPrototypeOf(objectPrototype), baselinePrototype);
  assert.equal(Reflect.getPrototypeOf({}), objectPrototype);
  assert.deepEqual(Reflect.ownKeys(objectPrototype), baselineKeys);
  assert.deepEqual(
    Object.getOwnPropertyDescriptors(objectPrototype),
    baselineDescriptors,
  );
}

export async function withPrototypeInvariant(
  operation: () => void | Promise<void>,
): Promise<void> {
  try {
    await operation();
  } finally {
    assertObjectPrototypeInvariant();
  }
}
