import { inspect } from 'node:util';

import { describe, expect, it } from 'vitest';

import {
  KasaneError,
  KasaneLayerError,
  KasaneMergeError,
  KasanePathError,
  KasaneSecurityError,
  KasaneSourceError,
  KasaneValidationError,
} from '../../../src/index.js';

const errorCases = [
  [KasaneError, 'KASANE_ERROR'],
  [KasaneLayerError, 'KASANE_LAYER_ERROR'],
  [KasaneSourceError, 'KASANE_SOURCE_ERROR'],
  [KasaneMergeError, 'KASANE_MERGE_ERROR'],
  [KasaneValidationError, 'KASANE_VALIDATION_ERROR'],
  [KasanePathError, 'KASANE_PATH_ERROR'],
  [KasaneSecurityError, 'KASANE_SECURITY_ERROR'],
] as const;

describe('Kasane error hierarchy', () => {
  it.each(errorCases)(
    '%s has a stable code and inheritance',
    (ErrorClass, code) => {
      const error = new ErrorClass();

      expect(error).toBeInstanceOf(ErrorClass);
      expect(error).toBeInstanceOf(KasaneError);
      expect(error).toBeInstanceOf(Error);
      expect(error.code).toBe(code);
      expect(() => {
        Object.assign(error, { code: 'CHANGED' });
      }).toThrow(TypeError);
      expect(error.code).toBe(code);
    },
  );

  it('preserves instanceof for user subclasses under ESM', () => {
    class CustomSourceError extends KasaneSourceError {}

    const error = new CustomSourceError();
    expect(error).toBeInstanceOf(CustomSourceError);
    expect(error).toBeInstanceOf(KasaneSourceError);
    expect(error).toBeInstanceOf(KasaneError);
    expect(error.name).toBe('KasaneSourceError');
    expect(error.code).toBe('KASANE_SOURCE_ERROR');
  });
});

describe('safe structured diagnostics', () => {
  it('copies only allowlisted details and deeply freezes the result', () => {
    const input = {
      path: 'database.pool.max',
      layerName: 'environment',
      kind: 'env',
      operation: 'validate',
      reference: 'DATABASE_POOL_MAX',
      limits: { maximumNodes: 1000 },
      unsafe: { secret: 'DETAILS_CANARY' },
    };
    const error = new KasaneValidationError(undefined, { details: input });

    expect(error.details).toEqual({
      path: 'database.pool.max',
      layerName: 'environment',
      kind: 'env',
      operation: 'validate',
      reference: 'DATABASE_POOL_MAX',
      limits: { maximumNodes: 1000 },
    });
    expect(Object.isFrozen(error.details)).toBe(true);
    expect(Object.isFrozen(error.details.limits)).toBe(true);
    expect(error.details).not.toBe(input);
    expect(error.details.limits).not.toBe(input.limits);
    expect(JSON.stringify(error)).not.toContain('DETAILS_CANARY');
  });

  it('does not invoke accessors while copying details', () => {
    let getterCalls = 0;
    const details = Object.defineProperty({}, 'path', {
      enumerable: true,
      get() {
        getterCalls += 1;
        return 'ACCESSOR_CANARY';
      },
    });

    const error = new KasanePathError(undefined, { details });
    expect(error.details).toEqual({});
    expect(getterCalls).toBe(0);
  });

  it('sanitizes a circular arbitrary cause without retaining it', () => {
    const cause: Error & { self?: unknown; payload?: unknown } = new Error(
      'CAUSE_CANARY',
    );
    cause.self = cause;
    cause.payload = { nested: 'CAUSE_CANARY' };

    const error = new KasaneSourceError('Layer source failed.', { cause });
    const json = JSON.stringify(error);
    const rendered = inspect(error, {
      depth: null,
      getters: true,
      showHidden: true,
    });

    expect(error.cause).toEqual({ name: 'Error' });
    expect(error.cause).not.toBe(cause);
    expect(json).not.toContain('CAUSE_CANARY');
    expect(rendered).not.toContain('CAUSE_CANARY');
    expect(error.stack).not.toContain('CAUSE_CANARY');
  });

  it('never invokes arbitrary cause hooks during JSON or inspection', () => {
    let hookCalls = 0;
    const cause = {
      name: 'ParserError',
      get message() {
        hookCalls += 1;
        return 'HOOK_CANARY';
      },
      toJSON() {
        hookCalls += 1;
        return 'HOOK_CANARY';
      },
      [inspect.custom]() {
        hookCalls += 1;
        return 'HOOK_CANARY';
      },
    };

    const error = new KasaneSourceError(undefined, { cause });
    expect(JSON.stringify(error)).not.toContain('HOOK_CANARY');
    expect(inspect(error, { getters: true })).not.toContain('HOOK_CANARY');
    expect(hookCalls).toBe(0);
  });

  it('summarizes safe Kasane causes and omits their message for secrets', () => {
    const cause = new KasanePathError('A safe library-authored reason.');
    const publicError = new KasaneValidationError(undefined, { cause });
    const secretError = new KasaneValidationError(undefined, {
      cause,
      secret: true,
    });

    expect(publicError.cause).toEqual({
      name: 'KasanePathError',
      code: 'KASANE_PATH_ERROR',
      message: 'A safe library-authored reason.',
    });
    expect(secretError.cause).toEqual({
      name: 'KasanePathError',
      code: 'KASANE_PATH_ERROR',
    });
  });
});
