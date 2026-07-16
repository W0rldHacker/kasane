import assert from 'node:assert/strict';

import { kasane, value } from 'kasane';

const snapshot = await kasane({
  layers: [
    value('defaults', {
      server: { host: '127.0.0.1', port: 3000 },
      retries: 1,
    }),
    value('runtime', {
      server: { port: 8080 },
      retries: 5,
    }),
  ],
});

assert.deepEqual(snapshot.value, {
  server: { host: '127.0.0.1', port: 8080 },
  retries: 5,
});
assert.equal(snapshot.get('server.port'), 8080);
assert.equal(Object.isFrozen(snapshot.value), true);

console.log('value pipeline smoke passed');
