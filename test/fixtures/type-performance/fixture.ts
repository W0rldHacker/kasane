import { ConfigSnapshot, kasane, value } from '@w0rldhacker/kasane';
import type { DeepReadonly } from '@w0rldhacker/kasane';

type Digit = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9';
type SectionName = `section-${Digit}${Digit}`;

type PerformanceConfig = {
  readonly [Key in SectionName]: {
    readonly enabled: boolean;
    readonly endpoints: {
      readonly host: string;
      readonly port: number;
    }[];
    readonly nested: {
      readonly retries: number;
      readonly tags: string[];
    };
  };
};

declare const input: PerformanceConfig;

const asserted = await kasane<PerformanceConfig>({
  layers: [value('performance', input)],
});
const assertedValue: DeepReadonly<PerformanceConfig> = asserted.value;
const runtimePathValue: unknown = asserted.get('section-00.nested.retries');
const arbitraryPathValue: unknown = asserted.require('not.a.typed.path');

const inferred = await kasane({
  layers: [value('performance', input)],
  async validate(candidate) {
    return candidate as PerformanceConfig;
  },
});
const inferredValue: DeepReadonly<PerformanceConfig> = inferred.value;
const direct = new ConfigSnapshot(input);
const directValue: DeepReadonly<PerformanceConfig> = direct.value;

void assertedValue;
void runtimePathValue;
void arbitraryPathValue;
void inferredValue;
void directValue;
