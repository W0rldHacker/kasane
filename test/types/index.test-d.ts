import { expectAssignable, expectType } from 'tsd';

import { file, kasane, remove, value } from 'kasane';
import type {
  ConfigSnapshot,
  FileLayerOptions,
  LayerDescriptor,
  LayerSource,
  SourceContext,
} from 'kasane';

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
expectAssignable<Promise<ConfigSnapshot<AppConfig>>>(
  kasane<AppConfig>({
    layers: [value('defaults', { server: { port: 3000 } })],
  }),
);
