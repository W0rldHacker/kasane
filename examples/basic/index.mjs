import { fileURLToPath } from 'node:url';

import { env, file, kasane, value } from 'kasane';

const cwd = fileURLToPath(new URL('.', import.meta.url));
const snapshot = await kasane({
  cwd,
  layers: [
    value('defaults', {
      format: 'human',
      logging: { level: 'info' },
      minify: false,
      output: './dist',
      server: { host: '127.0.0.1', port: 3000 },
    }),
    file('project-file', 'config.json'),
    file('local-optional', 'config.local.json', { optional: true }),
    env('environment', {
      map: {
        APP_LOG_LEVEL: 'logging.level',
        APP_PORT: { parse: Number, path: 'server.port' },
      },
      source: { APP_LOG_LEVEL: 'warn', APP_PORT: '5000' },
    }),
    value('arguments', {
      format: undefined,
      minify: true,
      output: './release',
      server: { port: undefined },
    }),
  ],
  provenance: 'full',
});

console.log(
  JSON.stringify({
    config: {
      format: snapshot.value.format,
      loggingLevel: snapshot.value.logging.level,
      minify: snapshot.value.minify,
      output: snapshot.value.output,
      serverPort: snapshot.value.server.port,
    },
    portHistory: snapshot
      .explain('server.port')
      .history?.map((entry) => entry.origin.layer.name),
  }),
);
