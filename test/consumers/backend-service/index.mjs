import assert from 'node:assert/strict';

import { env, kasane, secret, value } from '@worldhacker/kasane';

const secretCanary = 'BETA_BACKEND_SECRET_CANARY';
const snapshot = await kasane({
  layers: [
    value('defaults', {
      logging: { level: 'info' },
      server: { host: '127.0.0.1', port: 3000 },
    }),
    env('deployment', {
      map: {
        APP_LOG_LEVEL: 'logging.level',
        APP_PORT: { parse: Number, path: 'server.port' },
      },
      source: { APP_LOG_LEVEL: 'warn', APP_PORT: '4100' },
    }),
    secret('credentials', async () => ({ token: secretCanary })),
  ],
  provenance: 'full',
});

assert.equal(snapshot.value.server.port, 4100);
assert.equal(snapshot.value.logging.level, 'warn');
assert.equal(snapshot.explain('server.port').origin?.layer.name, 'deployment');
assert.equal(snapshot.explain('token').value, '[REDACTED]');
assert(!JSON.stringify(snapshot).includes(secretCanary));
