import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import { kasane, value } from 'kasane';
import { isStandardSchemaV1 } from 'kasane/standard-schema';

assert.equal(typeof kasane, 'function');
assert.equal(typeof value, 'function');
assert.equal(typeof isStandardSchemaV1, 'function');

const snapshot = await kasane({
  layers: [value('javascript', { enabled: true })],
});
assert.deepEqual(snapshot.value, { enabled: true });

const dynamicRoot = await import('kasane');
const dynamicSubpath = await import('kasane/standard-schema');
assert.equal(dynamicRoot.kasane, kasane);
assert.equal(dynamicSubpath.isStandardSchemaV1, isStandardSchemaV1);

for (const specifier of [
  'kasane/dist/index.js',
  'kasane/internal',
  'kasane/snapshot/public',
  'kasane/src/index.js',
  'kasane/watch',
]) {
  await assert.rejects(
    import(specifier),
    (error) => error?.code === 'ERR_PACKAGE_PATH_NOT_EXPORTED',
  );
}

const require = createRequire(import.meta.url);
assert.throws(
  () => require('kasane'),
  (error) => error?.code === 'ERR_PACKAGE_PATH_NOT_EXPORTED',
);
