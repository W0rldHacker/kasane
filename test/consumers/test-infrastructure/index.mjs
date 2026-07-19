import assert from 'node:assert/strict';

import { kasane, secret, value } from '@worldhacker/kasane';

const secretCanary = 'BETA_TEST_INFRA_SECRET_CANARY';
const baseline = await kasane({
  layers: [
    value('suite-defaults', { retries: 0, shard: 1 }),
    secret('test-credentials', { token: secretCanary }),
  ],
  provenance: 'full',
});
const worker = await kasane({
  layers: [
    value('suite-defaults', { retries: 0, shard: 1 }),
    value('worker', { retries: 2, shard: 3 }),
    secret('test-credentials', { token: secretCanary }),
  ],
  provenance: 'full',
});

assert.deepEqual(baseline.diff(worker).changes, [
  {
    after: {
      source: {
        available: true,
        kind: 'value',
        name: 'worker',
      },
      value: 2,
    },
    before: {
      source: {
        available: true,
        kind: 'value',
        name: 'suite-defaults',
      },
      value: 0,
    },
    path: 'retries',
    type: 'value-and-source-changed',
  },
  {
    after: {
      source: {
        available: true,
        kind: 'value',
        name: 'worker',
      },
      value: 3,
    },
    before: {
      source: {
        available: true,
        kind: 'value',
        name: 'suite-defaults',
      },
      value: 1,
    },
    path: 'shard',
    type: 'value-and-source-changed',
  },
]);
assert(!JSON.stringify(baseline.diff(worker)).includes(secretCanary));
