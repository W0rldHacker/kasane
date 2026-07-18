import { kasane, value } from '@w0rldhacker/kasane';
import { isStandardSchemaV1 } from '@w0rldhacker/kasane/standard-schema';
import type { DeepReadonly } from '@w0rldhacker/kasane';
import type { StandardSchemaV1 } from '@w0rldhacker/kasane/standard-schema';

interface SchemaOutput {
  readonly enabled: boolean;
  readonly nested: {
    readonly tags: readonly string[];
  };
  readonly port: number;
}

interface AssertedOutput {
  readonly server: {
    readonly port: number;
  };
}

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <
    Value,
  >() => Value extends Right ? 1 : 2
    ? true
    : false;
type Expect<Value extends true> = Value;

function assertEqual(actual: unknown, expected: unknown): void {
  if (!Object.is(actual, expected)) {
    throw new Error('Packed TypeScript consumer assertion failed.');
  }
}

const schema: StandardSchemaV1<unknown, SchemaOutput> = {
  '~standard': {
    validate: () => ({
      value: { enabled: true, nested: { tags: ['packed'] }, port: 8080 },
    }),
    vendor: 'packed-consumer',
    version: 1,
  },
};
assertEqual(isStandardSchemaV1(schema), true);

const inferred = await kasane({
  layers: [value('input', { enabled: 'true', port: '8080' })],
  validate: schema,
});
type InferredValue = typeof inferred.value;
type _inference = Expect<Equal<InferredValue, DeepReadonly<SchemaOutput>>>;
const inferenceProof: _inference = true;
assertEqual(inferenceProof, true);
assertEqual(inferred.value.port, 8080);

const asserted = await kasane<AssertedOutput>({
  layers: [value('asserted', { server: { port: 3000 } })],
});
assertEqual(asserted.value.server.port, 3000);

const dynamicRoot = await import('@w0rldhacker/kasane');
const dynamicSubpath = await import('@w0rldhacker/kasane/standard-schema');
assertEqual(dynamicRoot.kasane, kasane);
assertEqual(dynamicSubpath.isStandardSchemaV1, isStandardSchemaV1);

if (false) {
  // @ts-expect-error DeepReadonly must reject mutation in a packed consumer.
  inferred.value.port = 3000;
  // @ts-expect-error Nested arrays must remain deeply readonly.
  inferred.value.nested.tags.push('mutable');
  // @ts-expect-error Deep package paths are not exported.
  await import('@w0rldhacker/kasane/dist/index.js');
  // @ts-expect-error Workspace source paths are not exported.
  await import('@w0rldhacker/kasane/src/index.js');
}
