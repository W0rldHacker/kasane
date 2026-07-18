import * as fc from 'fast-check';

export interface DescriptorCase {
  readonly accessor: boolean;
  readonly key: string;
  readonly value: string;
}

export interface ResourceCase {
  readonly breadth: number;
  readonly depth: number;
  readonly maxDepth: number;
  readonly maxNodes: number;
  readonly maxStringLength: number;
  readonly text: string;
}

const byteStringArbitrary = fc
  .uint8Array({ maxLength: 128 })
  .map((bytes) => Buffer.from(bytes).toString('utf8'));

export const utf16StringArbitrary = fc
  .array(fc.integer({ max: 0xffff, min: 0 }), { maxLength: 96 })
  .map((units) => String.fromCharCode(...units));

const stringArbitrary = fc.oneof(
  fc.string({ maxLength: 96 }),
  byteStringArbitrary,
  utf16StringArbitrary,
);
const keyArbitrary = fc.oneof(
  {
    arbitrary: fc.constantFrom('__proto__', 'constructor', 'prototype'),
    weight: 1,
  },
  { arbitrary: stringArbitrary, weight: 9 },
);
const primitiveArbitrary = fc.oneof(
  fc.constant(null),
  fc.boolean(),
  fc.integer(),
  stringArbitrary,
);

export const objectArbitrary: fc.Arbitrary<unknown> = fc.letrec((tie) => ({
  node: fc.oneof(
    { arbitrary: primitiveArbitrary, weight: 6 },
    {
      arbitrary: fc.array(tie('node'), { maxLength: 6 }),
      weight: 2,
    },
    {
      arbitrary: fc.dictionary(keyArbitrary, tie('node'), { maxKeys: 6 }),
      weight: 3,
    },
  ),
})).node;

export const descriptorCaseArbitrary: fc.Arbitrary<DescriptorCase> = fc.record({
  accessor: fc.boolean(),
  key: keyArbitrary,
  value: stringArbitrary,
});

export const resourceCaseArbitrary: fc.Arbitrary<ResourceCase> = fc.record({
  breadth: fc.integer({ max: 24, min: 0 }),
  depth: fc.integer({ max: 24, min: 0 }),
  maxDepth: fc.integer({ max: 16, min: 0 }),
  maxNodes: fc.integer({ max: 128, min: 0 }),
  maxStringLength: fc.integer({ max: 128, min: 0 }),
  text: stringArbitrary,
});

export const diagnosticArbitrary = fc.oneof(
  objectArbitrary,
  fc.uint8Array({ maxLength: 512 }),
  utf16StringArbitrary,
);

export const secretSuffixArbitrary = fc.oneof(
  fc.string({ maxLength: 64 }),
  utf16StringArbitrary,
  byteStringArbitrary,
);
