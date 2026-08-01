import type { ConfigSnapshot } from '@worldhacker/kasane';

import { typedPaths } from '../src/typed-paths.js';
import type { TypedPath, TypedPathValue } from '../src/typed-paths.js';

type Digit = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9';
type SectionName = `section-${Digit}${Digit}`;

type LargeConfig = Readonly<
  Record<
    SectionName,
    {
      readonly level1: {
        readonly level2: {
          readonly level3: {
            readonly level4: {
              readonly enabled: boolean;
              readonly value: number;
            };
          };
        };
      };
      readonly servers: readonly {
        readonly host: string;
        readonly port: number;
      }[];
    }
  >
>;

declare const snapshot: ConfigSnapshot<LargeConfig>;
const reader = typedPaths(snapshot, { depth: 6 });

const value: number = reader.require(
  'section-99.level1.level2.level3.level4.value',
);
const port: number | undefined = reader.get('section-42.servers.0.port');
type OnePath = TypedPath<LargeConfig, 6>;
type OneValue = TypedPathValue<LargeConfig, 'section-00.servers.0.host'>;
const typedValue: OneValue = 'localhost';

void value;
void port;
void typedValue;
void (null as unknown as OnePath);
