import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import { kasane, secret, value } from '@w0rldhacker/kasane';
import { isStandardSchemaV1 } from '@w0rldhacker/kasane/standard-schema';

assert.equal(typeof kasane, 'function');
assert.equal(typeof value, 'function');
assert.equal(typeof isStandardSchemaV1, 'function');

const snapshot = await kasane({
  layers: [value('javascript', { enabled: true })],
});
assert.deepEqual(snapshot.value, { enabled: true });

const secretCanary = 'PACKED_CONSUMER_SECRET_CANARY';
const secretSnapshot = await kasane({
  layers: [secret('consumer-secret', { token: secretCanary })],
  provenance: 'full',
});
const explanation = secretSnapshot.explain('token');
assert.equal(explanation.found, true);
assert.equal(explanation.found ? explanation.value : undefined, '[REDACTED]');
assert(!JSON.stringify(explanation).includes(secretCanary));

const dynamicRoot = await import('@w0rldhacker/kasane');
const dynamicSubpath = await import('@w0rldhacker/kasane/standard-schema');
assert.equal(dynamicRoot.kasane, kasane);
assert.equal(dynamicSubpath.isStandardSchemaV1, isStandardSchemaV1);

for (const specifier of [
  '@w0rldhacker/kasane/dist/index.js',
  '@w0rldhacker/kasane/internal',
  '@w0rldhacker/kasane/snapshot/public',
  '@w0rldhacker/kasane/src/index.js',
  '@w0rldhacker/kasane/watch',
]) {
  await assert.rejects(
    import(specifier),
    (error) => error?.code === 'ERR_PACKAGE_PATH_NOT_EXPORTED',
  );
}

const require = createRequire(import.meta.url);
assert.throws(
  () => require('@w0rldhacker/kasane'),
  (error) => error?.code === 'ERR_PACKAGE_PATH_NOT_EXPORTED',
);
