import { kasane, secret, value } from '@w0rldhacker/kasane';

const secretCanary = 'EXAMPLE_SECRET_CANARY';
const snapshot = await kasane({
  fingerprintKey: 'example-test-fingerprint-key',
  layers: [
    value('public', { service: { name: 'example' } }),
    secret('test-secrets', async () => {
      await Promise.resolve();
      return { service: { token: secretCanary } };
    }),
  ],
  provenance: 'full',
});
const explanation = snapshot.explain('service.token');
const output = {
  explanation: {
    historyKinds: explanation.history?.map((entry) => entry.kind),
    origin: explanation.origin?.layer.name,
    value: explanation.found ? explanation.value : undefined,
  },
  json: snapshot.toJSON(),
};

if (JSON.stringify(output).includes(secretCanary)) {
  throw new Error('Secret canary reached a diagnostic output.');
}
console.log(JSON.stringify(output));
