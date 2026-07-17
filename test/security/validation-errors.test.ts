import { inspect } from 'node:util';

import { describe, expect, it } from 'vitest';

import { KasaneValidationError, kasane, secret } from '../../src/index.js';
import type { StandardSchemaV1 } from '../../src/standard-schema.js';

async function validationFailure(
  operation: Promise<unknown>,
): Promise<KasaneValidationError> {
  try {
    await operation;
  } catch (error) {
    if (error instanceof KasaneValidationError) return error;
    throw error;
  }
  throw new Error('Expected validation to fail.');
}

function allSurfaces(error: KasaneValidationError): string {
  return [
    error.message,
    error.stack ?? '',
    JSON.stringify(error),
    inspect(error, { depth: null, getters: true, showHidden: true }),
  ].join('\n');
}

describe('validation error security', () => {
  it('redacts and fingerprints secret current and previous values', async () => {
    const previousCanary = 'VALIDATION_PREVIOUS_SECRET_CANARY';
    const currentCanary = 'VALIDATION_CURRENT_SECRET_CANARY';
    const schema: StandardSchemaV1 = {
      '~standard': {
        version: 1,
        vendor: 'fixture',
        validate: () => ({
          issues: [
            {
              message: `Rejected ${currentCanary}`,
              path: ['token'],
            },
          ],
        }),
      },
    };
    const failure = await validationFailure(
      kasane({
        fingerprintKey: 'validation-fixture-key',
        layers: [
          secret('previous-secret', { token: previousCanary }),
          secret('current-secret', { token: currentCanary }),
        ],
        provenance: 'full',
        validate: schema,
      }),
    );

    const issue = failure.issues?.[0];
    expect(issue).toMatchObject({
      path: 'token',
      previous: {
        origin: { layer: { name: 'previous-secret' }, secret: true },
        value: '[REDACTED]',
      },
      received: '[REDACTED]',
      source: { layer: { name: 'current-secret' }, secret: true },
    });
    expect(issue?.receivedFingerprint).toMatch(/^v1:hmac-sha256:/u);
    expect(issue?.previous?.fingerprint).toMatch(/^v1:hmac-sha256:/u);
    expect(issue?.receivedFingerprint).not.toBe(issue?.previous?.fingerprint);

    const rendered = allSurfaces(failure);
    expect(rendered).not.toContain(previousCanary);
    expect(rendered).not.toContain(currentCanary);
    expect(rendered).not.toContain(`Rejected ${currentCanary}`);
  });

  it('retains only a sanitized summary for a thrown custom error', async () => {
    const canary = 'THROWN_VALIDATOR_SECRET_CANARY';
    let hookCalls = 0;
    const cause = new Error(`Custom failure contains ${canary}`) as Error & {
      toJSON?: () => string;
    };
    cause.toJSON = () => {
      hookCalls += 1;
      return canary;
    };
    Object.defineProperty(cause, inspect.custom, {
      value() {
        hookCalls += 1;
        return canary;
      },
    });

    const failure = await validationFailure(
      kasane({
        layers: [secret('vault', { token: canary })],
        validate: () => {
          throw cause;
        },
      }),
    );

    expect(failure.cause).toEqual({ name: 'Error' });
    expect(failure.issues?.[0]).toMatchObject({
      path: '',
      received: { token: '[REDACTED]' },
    });
    expect(allSurfaces(failure)).not.toContain(canary);
    expect(hookCalls).toBe(0);
  });
});
