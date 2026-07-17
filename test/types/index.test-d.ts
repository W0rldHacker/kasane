import { expectAssignable, expectType } from 'tsd';

import { env, file, kasane, remove, secret, secretValue, value } from 'kasane';
import type {
  ConfigDiff,
  ConfigSnapshot,
  EnvLayerOptions,
  Explanation,
  FingerprintKey,
  FileLayerOptions,
  LayerDescriptor,
  LayerSource,
  Origin,
  SourceContext,
  SecretValue,
} from 'kasane';

expectAssignable<FingerprintKey>('application-key');
expectAssignable<FingerprintKey>(new Uint8Array([1, 2, 3]));

expectAssignable<symbol>(remove);

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

declare const snapshot: ConfigSnapshot<AppConfig>;
expectType<Origin | undefined>(snapshot.origin('server.port'));
expectType<Explanation>(snapshot.explain('server.port'));
expectType<string>(snapshot.explain('server.port').format());
expectType<ConfigDiff>(snapshot.diff(snapshot));
