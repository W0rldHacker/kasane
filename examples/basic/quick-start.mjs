import { fileURLToPath } from 'node:url';

import { env, file, kasane, value } from 'kasane';

const cwd = fileURLToPath(new URL('.', import.meta.url));
const config = await kasane({
  cwd,
  layers: [
    value('defaults', {
      server: { host: '127.0.0.1', port: 3000 },
    }),
    file('application', 'config.json'),
    env('environment', {
      map: {
        APP_SERVER_PORT: { parse: Number, path: 'server.port' },
      },
      source: { APP_SERVER_PORT: '5000' },
    }),
  ],
  provenance: 'full',
});

const port = config.explain('server.port');
console.log(
  JSON.stringify({
    server: config.value.server,
    source: port.origin?.layer.name,
    history: port.history?.map((entry) => entry.origin.layer.name),
  }),
);
