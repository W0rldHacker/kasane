import { fileURLToPath } from 'node:url';

import { file, kasane } from 'kasane';

function parseSettings(source) {
  const entries = Object.fromEntries(
    source
      .trim()
      .split(/\r?\n/u)
      .map((line) => line.split('=', 2)),
  );
  return {
    server: {
      host: entries.host,
      port: Number(entries.port),
    },
  };
}

const cwd = fileURLToPath(new URL('.', import.meta.url));
const snapshot = await kasane({
  cwd,
  layers: [file('settings', 'settings.conf', { parse: parseSettings })],
});
const origin = snapshot.origin('server.port');

console.log(
  JSON.stringify({
    origin: { kind: origin?.layer.kind, name: origin?.layer.name },
    server: snapshot.value.server,
  }),
);
