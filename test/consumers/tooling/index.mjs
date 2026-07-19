import assert from 'node:assert/strict';

import { kasane, remove, secretValue, value } from '@worldhacker/kasane';

const argumentSecret = 'BETA_TOOL_SECRET_CANARY';
const snapshot = await kasane({
  layers: [
    value('project', {
      format: 'human',
      output: './dist',
      telemetry: true,
    }),
    value('arguments', {
      format: 'json',
      output: remove,
      token: secretValue(argumentSecret),
    }),
  ],
  provenance: 'full',
});

assert.equal(snapshot.value.format, 'json');
assert.equal(snapshot.has('output'), false);
assert.equal(snapshot.explain('output').removal?.layer.name, 'arguments');
assert.equal(snapshot.explain('token').value, '[REDACTED]');
const safeDiagnostic = snapshot.explain('token').format();
assert(!safeDiagnostic.includes(argumentSecret));
