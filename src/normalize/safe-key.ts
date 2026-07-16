const DANGEROUS_PROTO_KEY = '__proto__';
const DANGEROUS_PROTOTYPE_KEY = 'prototype';
const DANGEROUS_CONSTRUCTOR_KEY = 'constructor';

export function isSafeConfigKey(key: string): boolean {
  return (
    key !== DANGEROUS_PROTO_KEY &&
    key !== DANGEROUS_PROTOTYPE_KEY &&
    key !== DANGEROUS_CONSTRUCTOR_KEY
  );
}
