import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  KasaneValidationError,
  env,
  file,
  kasane,
  value,
} from '../../src/index.js';
import type { StandardSchemaV1 } from '../../src/standard-schema.js';

async function expectValidationFailure(
  operation: Promise<unknown>,
): Promise<KasaneValidationError> {
  try {
    await operation;
  } catch (error) {
    expect(error).toBeInstanceOf(KasaneValidationError);
    return error as KasaneValidationError;
  }
  throw new Error('Expected validation to fail.');
}

describe('validation error diagnostics', () => {
  it('sorts nested, root, and multiple issues with env provenance', async () => {
    const schema: StandardSchemaV1 = {
      '~standard': {
        version: 1,
        vendor: 'fixture',
        validate: () => ({
          issues: [
            { message: 'missing field', path: ['missing'] },
            {
              message: '500 must be lower',
              path: ['database', { key: 'pool' }, 'max'],
            },
            { message: 'root failure' },
          ],
        }),
      },
    };
    const failure = await expectValidationFailure(
      kasane({
        layers: [
          value('defaults', { database: { pool: { max: 20 } } }),
          env('environment', {
            prefix: 'APP_',
            source: { APP_DATABASE__POOL__MAX: '500' },
          }),
        ],
        provenance: 'full',
        validate: schema,
      }),
    );

    expect(failure.issues?.map((issue) => issue.path)).toEqual([
      '',
      'database.pool.max',
      'missing',
    ]);
    const nested = failure.issues?.[1];
    expect(nested).toMatchObject({
      path: 'database.pool.max',
      previous: {
        origin: { layer: { kind: 'value', name: 'defaults' } },
        value: 20,
      },
      reason: 'Validation constraint was not satisfied.',
      received: '500',
      source: {
        inputReference: 'APP_DATABASE__POOL__MAX',
        layer: { kind: 'env', name: 'environment' },
      },
    });
    expect(failure.details).toMatchObject({
      kind: 'standard-schema-failure',
      operation: 'validate',
      path: '',
    });
    expect(failure.message).toContain('database.pool.max');
    expect(failure.message).toContain('APP_DATABASE__POOL__MAX');
    expect(failure.message).not.toContain('500 must be lower');
  });

  it('resolves a file source reference', async () => {
    const fixture = path.resolve('test', 'fixtures', 'file', 'valid.json');
    const schema: StandardSchemaV1 = {
      '~standard': {
        version: 1,
        vendor: 'fixture',
        validate: () => ({
          issues: [{ message: 'bad port', path: ['server', 'port'] }],
        }),
      },
    };
    const failure = await expectValidationFailure(
      kasane({ layers: [file('configuration', fixture)], validate: schema }),
    );

    expect(failure.issues?.[0]).toMatchObject({
      path: 'server.port',
      received: 3000,
      source: {
        layer: { kind: 'file', name: 'configuration' },
        sourceReference: fixture,
      },
    });
  });

  it('degrades unsafe issue segments to root without invoking accessors', async () => {
    const symbolCanary = Symbol('MALFORMED_PATH_CANARY');
    let getterCalls = 0;
    const accessorSegment = Object.defineProperty({}, 'key', {
      get() {
        getterCalls += 1;
        return 'MALFORMED_PATH_CANARY';
      },
    }) as StandardSchemaV1.PathSegment;
    const schema: StandardSchemaV1 = {
      '~standard': {
        version: 1,
        vendor: 'fixture',
        validate: () => ({
          issues: [
            { message: 'unsafe symbol', path: [symbolCanary] },
            { message: 'unsafe accessor', path: [accessorSegment] },
          ],
        }),
      },
    };
    const failure = await expectValidationFailure(
      kasane({ layers: [value('input', { safe: true })], validate: schema }),
    );

    expect(failure.issues).toHaveLength(2);
    expect(failure.issues?.every((issue) => issue.path === '')).toBe(true);
    expect(failure.issues?.map((issue) => issue.pathDescription)).toEqual([
      'Unsupported validation issue path segment at index 0 (symbol).',
      'Unsupported validation issue path segment at index 0 (uninspectable-object).',
    ]);
    expect(getterCalls).toBe(0);
    expect(JSON.stringify(failure)).not.toContain('MALFORMED_PATH_CANARY');
  });
});
