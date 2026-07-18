import { KasaneValidationError, kasane, value } from 'kasane';

const backendSchema = {
  '~standard': {
    validate(input) {
      const config = input;
      const port = Number(config?.server?.port);
      if (!Number.isInteger(port) || port < 1 || port > 65_535) {
        return {
          issues: [
            {
              message: 'Expected an integer port between 1 and 65535.',
              path: ['server', 'port'],
            },
          ],
        };
      }
      return {
        value: {
          ...config,
          server: { ...config.server, port },
        },
      };
    },
    vendor: 'kasane-example',
    version: 1,
  },
};

const snapshot = await kasane({
  layers: [
    value('defaults', {
      server: { host: '127.0.0.1', port: '8080' },
    }),
  ],
  validate: backendSchema,
});

let failedValidation;
try {
  await kasane({
    layers: [value('invalid', { server: { port: 'not-a-port' } })],
    validate: backendSchema,
  });
} catch (error) {
  if (!(error instanceof KasaneValidationError)) throw error;
  failedValidation = {
    code: error.code,
    kind: error.details.kind,
    path: error.details.path,
  };
}

if (failedValidation === undefined) {
  throw new Error('The invalid backend configuration unexpectedly passed.');
}

console.log(
  JSON.stringify({
    failedValidation,
    server: snapshot.value.server,
  }),
);
