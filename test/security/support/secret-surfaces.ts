import assert from 'node:assert/strict';
import { inspect } from 'node:util';

import { kasane, secret } from '../../../src/index.js';
import type { KasaneEvent } from '../../../src/index.js';
import { safeStringify } from '../../../src/diagnostics/safe-json.js';

export const SECRET_CANARY = 'QA004_SECRET_CANARY_7c623ed8';

function render(value: unknown): readonly string[] {
  return [
    JSON.stringify(value),
    inspect(value, {
      colors: true,
      depth: null,
      getters: true,
      showHidden: true,
    }),
    safeStringify(value),
  ];
}

function assertNoCanary(outputs: readonly string[]): void {
  for (const output of outputs) {
    assert.equal(output.includes(SECRET_CANARY), false, output);
  }
}

/** Exercises every public diagnostic surface with one secret canary case. */
export async function assertSecretSurfacesSafe(suffix: string): Promise<void> {
  const secretValue = `${SECRET_CANARY}:${suffix}`;
  const beforeEvents: KasaneEvent[] = [];
  const afterEvents: KasaneEvent[] = [];
  const before = await kasane({
    fingerprintKey: 'qa-004-fuzz-key',
    layers: [
      secret('vault-before', {
        credentials: { history: [secretValue], token: secretValue },
      }),
    ],
    onEvent: (event) => beforeEvents.push(event),
    provenance: 'full',
  });
  const after = await kasane({
    fingerprintKey: 'qa-004-fuzz-key',
    layers: [
      secret('vault-after', {
        credentials: {
          history: [secretValue],
          token: `${secretValue}:changed`,
        },
      }),
    ],
    onEvent: (event) => afterEvents.push(event),
    provenance: 'full',
  });

  const explanation = before.explain('credentials');
  const diff = before.diff(after);
  const outputs = [
    ...render(before),
    ...render(before.toJSON()),
    ...render(explanation),
    explanation.format(),
    ...render(diff),
    ...render([...beforeEvents, ...afterEvents]),
  ];

  const hostileCause = new Error(secretValue);
  Object.defineProperty(hostileCause, SECRET_CANARY, {
    enumerable: true,
    value: secretValue,
  });
  try {
    await kasane({
      layers: [
        secret('failing-vault', () => {
          throw hostileCause;
        }),
      ],
    });
    assert.fail('Expected the hostile secret source to fail.');
  } catch (error) {
    outputs.push(...render(error));
    if (error instanceof Error) {
      outputs.push(error.message, error.stack ?? '');
    }
  }

  assertNoCanary(outputs);
}
