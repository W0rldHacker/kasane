import { expectError, expectType } from 'tsd';

import { kasane, value } from '@worldhacker/kasane';
import type {
  ConfigIssue,
  DeepReadonly,
  FunctionValidator,
  KasaneValidationError,
} from '@worldhacker/kasane';
import type { StandardSchemaV1 } from '@worldhacker/kasane/standard-schema';

interface ValidatedConfig {
  enabled: boolean;
  nested?: {
    tags: string[];
  };
  port: number;
}

const functionValidator: FunctionValidator<ValidatedConfig> = (input) => {
  const value = input as { enabled: string; port: string };
  return {
    enabled: value.enabled === 'true',
    nested: { tags: ['validated'] },
    port: Number(value.port),
  };
};

const functionSnapshot = await kasane({
  layers: [value('input', { enabled: 'true', port: '8080' })],
  validate: functionValidator,
});
expectType<DeepReadonly<ValidatedConfig>>(functionSnapshot.value);
expectError((functionSnapshot.value.port = 3000));
expectError(functionSnapshot.value.nested?.tags.push('mutable'));

const asyncSnapshot = await kasane({
  layers: [value('input', { port: '8080' })],
  async validate(input) {
    return { port: Number((input as { port: string }).port) };
  },
});
expectType<Readonly<{ readonly port: number }>>(asyncSnapshot.value);

const tupleSnapshot = await kasane({
  layers: [value('input', {})],
  validate: () => ({ endpoint: ['localhost', 8080] as [string, number] }),
});
expectType<Readonly<{ readonly endpoint: readonly [string, number] }>>(
  tupleSnapshot.value,
);
expectError((tupleSnapshot.value.endpoint[1] = 3000));

const schema: StandardSchemaV1<unknown, ValidatedConfig> = {
  '~standard': {
    version: 1,
    vendor: 'fixture',
    validate: () => ({
      value: { enabled: true, nested: { tags: ['schema'] }, port: 8080 },
    }),
  },
};
const schemaSnapshot = await kasane({
  layers: [value('input', {})],
  validate: schema,
});
expectType<DeepReadonly<ValidatedConfig>>(schemaSnapshot.value);

declare const validationError: KasaneValidationError;
expectType<readonly ConfigIssue[] | undefined>(validationError.issues);
