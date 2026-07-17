import { expectAssignable, expectError, expectType } from 'tsd';

import {
  ConfigSnapshot,
  env,
  file,
  kasane,
  remove,
  secret,
  secretValue,
  value,
} from 'kasane';
import type {
  ConfigDiff,
  EnvLayerOptions,
  Explanation,
  FingerprintKey,
  FileLayerOptions,
  LayerDescriptor,
  LayerSource,
  KasaneEvent,
  KasaneEventCallback,
  KasaneErrorJson,
  KasaneLimits,
  KasaneOptions,
  Origin,
  SourceContext,
  SecretValue,
} from 'kasane';

expectAssignable<FingerprintKey>('application-key');
expectAssignable<FingerprintKey>(new Uint8Array([1, 2, 3]));
expectAssignable<KasaneLimits>({
  maxDepth: 32,
  maxNodes: 10_000,
  maxSourceBytes: 1_000_000,
  maxStringLength: 100_000,
});

expectAssignable<symbol>(remove);
expectType<Readonly<{ readonly answer: number }>>(
  new ConfigSnapshot({ answer: 42 }).value,
);
expectError(new ConfigSnapshot({ answer: 42 }, { freeze: false }));

interface AppConfig {
  server: {
    port: number;
  };
}

const customSource: LayerSource<{ server: { port: number } }> = {
  kind: 'custom',
  async load(context: SourceContext) {
    expectType<string>(context.cwd);
    return { server: { port: 8080 } };
  },
};

expectAssignable<LayerDescriptor>({ name: 'custom', source: customSource });
const eventCallback = (event: KasaneEvent): void => {
  switch (event.type) {
    case 'source:start':
    case 'merge:start':
    case 'validation:start':
      expectType<string>(event.layer);
      break;
    case 'source:end':
    case 'merge:end':
    case 'validation:end':
      expectType<boolean>(event.success);
      expectType<number>(event.nodes);
      break;
    case 'snapshot:created':
      expectType<number>(event.durationMs);
      break;
    default: {
      const exhaustive: never = event;
      expectType<never>(exhaustive);
    }
  }
};
expectAssignable<KasaneEventCallback>(eventCallback);
expectAssignable<FileLayerOptions<{ server: { port: number } }>>({
  parse: async (source) => JSON.parse(source) as { server: { port: number } },
});
expectAssignable<LayerDescriptor>(file('config', './config.json'));
expectAssignable<EnvLayerOptions>({
  case: 'preserve',
  coerce: 'json',
  map: { APP_PORT: { parse: Number, path: 'server.port' } },
  source: { APP_PORT: '8080' },
});
expectAssignable<LayerDescriptor>(env('environment', { prefix: 'APP_' }));
expectAssignable<SecretValue<string>>(secretValue('token'));
expectAssignable<LayerDescriptor>(
  secret('vault', async () => ({ token: 'x' })),
);
expectAssignable<LayerDescriptor>({
  name: 'custom-secret',
  secret: true,
  source: customSource,
});
expectAssignable<Promise<ConfigSnapshot<AppConfig>>>(
  kasane<AppConfig>({
    fingerprintKey: 'application-key',
    layers: [value('defaults', { server: { port: 3000 } })],
    secrets: ['server.token', 'integrations.*.token'],
  }),
);

const assertedSnapshot = await kasane<AppConfig>({
  layers: [value('asserted', { server: { port: 3000 } })],
});
expectType<Readonly<{ readonly server: { readonly port: number } }>>(
  assertedSnapshot.value,
);
expectError((assertedSnapshot.value.server.port = 4000));

expectError(
  kasane({
    layers: [value('invalid-merge', {})],
    merge: { items: 'dedupe' },
  }),
);

declare const options: KasaneOptions;
expectError((options.layers = []));

declare const descriptor: LayerDescriptor;
expectError((descriptor.name = 'changed'));

declare const snapshot: ConfigSnapshot<AppConfig>;
expectError((snapshot.get = () => undefined));
expectType<unknown>(snapshot.get('server.port'));
expectType<unknown>(snapshot.get('not.a.typed.path'));
expectType<unknown>(snapshot.require('server.port'));
expectType<Origin | undefined>(snapshot.origin('server.port'));
expectType<Explanation>(snapshot.explain('server.port'));
expectType<string>(snapshot.explain('server.port').format());
expectType<ConfigDiff>(snapshot.diff(snapshot));

declare const origin: Origin;
expectType<number>(origin.layer.id);
expectType<string>(origin.layer.name);

declare const errorJson: KasaneErrorJson;
expectError((errorJson.code = 'changed'));

declare const explanation: Explanation;
expectError((explanation.format = () => 'changed'));

declare const source: LayerSource;
expectError((source.load = () => undefined));
