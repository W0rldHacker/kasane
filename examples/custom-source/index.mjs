import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { kasane, value } from 'kasane';

const cwd = fileURLToPath(new URL('.', import.meta.url));
const runtimeSource = {
  name: 'runtime-discovery',
  source: {
    kind: 'custom',
    async load(context) {
      await Promise.resolve();
      if (path.basename(context.cwd) !== 'custom-source') {
        throw new Error('Unexpected custom source cwd.');
      }
      return {
        service: {
          endpoint: 'https://service.example.test',
          region: 'test-region-1',
        },
      };
    },
  },
};

const snapshot = await kasane({
  cwd,
  layers: [value('defaults', { service: { retries: 3 } }), runtimeSource],
});
const origin = snapshot.origin('service.region');

console.log(
  JSON.stringify({
    origin: { kind: origin?.layer.kind, name: origin?.layer.name },
    service: snapshot.value.service,
  }),
);
