import { describe, expect, it } from 'vitest';

import { KasaneValidationError } from '../../../src/errors/index.js';
import type { ConfigNode } from '../../../src/normalize/types.js';
import {
  createRootConfigIssue,
  normalizeStandardSchemaIssues,
} from '../../../src/validation/issues.js';
import type { ConfigIssueContext } from '../../../src/validation/issues.js';
import { createValidationError } from '../../../src/validation/validation-error.js';
import {
  prepareValidation,
  validateConfigValue,
} from '../../../src/validation/validate.js';
import type { PreparedValidation } from '../../../src/validation/validate.js';
import { createProvenanceFixture } from '../builders/provenance.js';

function issueContext(
  value?: ConfigNode,
  includeSource = true,
): ConfigIssueContext {
  const actualValue: ConfigNode | undefined =
    arguments.length === 0
      ? {
          nested: { values: [1, true] },
          token: 'fixture-current',
        }
      : value;
  const fixture = createProvenanceFixture({ name: 'input' });
  const merged = fixture.apply('input', actualValue, undefined, {
    mode: 'full',
  });
  if (merged.provenance === undefined) throw new Error('Missing provenance');
  return {
    includeSource,
    provenance: merged.provenance,
    registry: fixture.registry,
    value: actualValue,
  };
}

function requirePrepared(input: unknown): PreparedValidation {
  const prepared = prepareValidation(input);
  if (prepared === undefined) throw new Error('Missing prepared validation');
  return prepared;
}

function captureValidationError(error: unknown): KasaneValidationError {
  if (!(error instanceof KasaneValidationError)) throw error;
  return error;
}

describe('Standard Schema issue normalization', () => {
  it.each([
    undefined,
    null,
    {},
    new Proxy([], {}),
    Array.from({ length: 1_001 }, () => ({})),
    Array(1),
  ])('rejects invalid issue collection %#', (rawIssues) => {
    expect(
      normalizeStandardSchemaIssues(rawIssues, issueContext()),
    ).toBeUndefined();
  });

  it('creates one root issue for an empty issue list', () => {
    expect(normalizeStandardSchemaIssues([], issueContext())).toMatchObject([
      { path: '', reason: 'Validation constraint was not satisfied.' },
    ]);
  });

  it.each([
    { description: undefined, path: undefined },
    {
      description: 'Unsupported validation issue path (non-array).',
      path: 'not-an-array',
    },
    {
      description: 'Unsupported validation issue path (non-array).',
      path: new Proxy([], {}),
    },
    {
      description:
        'Unsupported validation issue path segment at index 0 (null).',
      path: [null],
    },
    {
      description:
        'Unsupported validation issue path segment at index 0 (boolean).',
      path: [true],
    },
    {
      description:
        'Unsupported validation issue path segment at index 0 (bigint).',
      path: [1n],
    },
    {
      description:
        'Unsupported validation issue path segment at index 0 (symbol).',
      path: [Symbol('fixture')],
    },
    {
      description:
        'Unsupported validation issue path segment at index 0 (undefined).',
      path: [undefined],
    },
    {
      description:
        'Unsupported validation issue path segment at index 0 (function).',
      path: [() => undefined],
    },
    {
      description:
        'Unsupported validation issue path segment at index 0 (unsafe-number).',
      path: [Number.NaN],
    },
    {
      description:
        'Unsupported validation issue path segment at index 0 (unsafe-number).',
      path: [-1],
    },
    {
      description:
        'Unsupported validation issue path segment at index 0 (string).',
      path: [''],
    },
    {
      description:
        'Unsupported validation issue path segment at index 0 (string).',
      path: ['x'.repeat(4_097)],
    },
    {
      description:
        'Unsupported validation issue path segment at index 0 (string).',
      path: ['constructor'],
    },
    {
      description:
        'Unsupported validation issue path segment at index 0 (uninspectable-object).',
      path: [Object.defineProperty({}, 'key', { get: () => 'hidden' })],
    },
    {
      description: 'Unsupported validation issue path (outside limits).',
      path: ['x'.repeat(3_000), 'y'.repeat(3_000)],
    },
  ])('normalizes hostile path %#', ({ description, path }) => {
    const [issue] =
      normalizeStandardSchemaIssues([{ path }], issueContext()) ?? [];
    expect(issue?.path).toBe('');
    expect(issue?.pathDescription).toBe(description);
  });

  it('normalizes numeric and keyed path segments and freezes received data', () => {
    const issues = normalizeStandardSchemaIssues(
      [
        { path: ['nested', { key: 'values' }, 0] },
        { path: ['nested', 'values', 1] },
      ],
      issueContext(),
    );
    expect(issues?.map(({ path }) => path)).toEqual([
      'nested.values.0',
      'nested.values.1',
    ]);
    expect(issues?.[0]?.received).toBe(1);
    expect(Object.isFrozen(issues)).toBe(true);
  });

  it('omits source and received data when unavailable', () => {
    expect(createRootConfigIssue(issueContext(undefined, false))).toEqual([
      {
        path: '',
        reason: 'Validation constraint was not satisfied.',
      },
    ]);
  });

  it('includes public previous history and redacts secret previous history', () => {
    const fixture = createProvenanceFixture(
      { name: 'first' },
      { kind: 'secret', name: 'second' },
    );
    const first = fixture.apply(
      'first',
      { token: 'fixture-before' },
      undefined,
      {
        mode: 'full',
      },
    );
    const second = fixture.apply('second', { token: 'fixture-after' }, first, {
      mode: 'full',
      secret: true,
    });
    const provenance = second.provenance;
    if (provenance === undefined) throw new Error('Missing provenance');
    const [issue] =
      normalizeStandardSchemaIssues([{ path: ['token'] }], {
        fingerprintKey: 'fixture-key',
        includeSource: true,
        provenance,
        registry: fixture.registry,
        value: second.value,
      }) ?? [];

    expect(issue).toMatchObject({
      path: 'token',
      previous: { value: '[REDACTED]' },
      received: '[REDACTED]',
      source: { secret: true },
    });
    expect(issue?.receivedFingerprint).toMatch(/^v1:hmac-sha256:/u);
    expect(JSON.stringify(issue)).not.toContain('fixture-before');
    expect(JSON.stringify(issue)).not.toContain('fixture-after');
  });

  it('uses stable secondary ordering for equal root paths', () => {
    const issues = normalizeStandardSchemaIssues(
      [{ path: [null] }, { path: [true] }, {}],
      issueContext(),
    );
    expect(issues?.map(({ pathDescription }) => pathDescription ?? '')).toEqual(
      [
        '',
        'Unsupported validation issue path segment at index 0 (boolean).',
        'Unsupported validation issue path segment at index 0 (null).',
      ],
    );
  });
});

describe('validation adapter defensive results', () => {
  it('constructs stable errors for empty and source-only issue lists', () => {
    const empty = createValidationError('empty-fixture', []);
    expect(empty.details).toEqual({
      kind: 'empty-fixture',
      operation: 'validate',
    });

    const rootIssues = createRootConfigIssue(issueContext());
    const sourced = createValidationError('source-fixture', rootIssues);
    expect(sourced.details).toMatchObject({
      kind: 'source-fixture',
      layerName: 'input',
      operation: 'validate',
      path: '',
    });
    expect(sourced.details).not.toHaveProperty('reference');
  });

  it('prepares undefined, function, structural schema, and rejects other values', () => {
    expect(prepareValidation(undefined)).toBeUndefined();
    expect(prepareValidation(() => true)).toMatchObject({ kind: 'function' });
    expect(
      prepareValidation({
        '~standard': {
          validate: () => ({ value: true }),
          vendor: 'fixture',
          version: 1,
        },
      }),
    ).toMatchObject({ kind: 'standard-schema' });
    expect(() => prepareValidation({})).toThrow(KasaneValidationError);
    expect(() => prepareValidation(null)).toThrow(KasaneValidationError);
  });

  it.each([
    {
      expectedKind: 'invalid-standard-schema-result',
      result: {},
    },
    {
      expectedKind: 'invalid-standard-schema-result',
      result: new Proxy({}, {}),
    },
    {
      expectedKind: 'invalid-standard-schema-result',
      result: { issues: {} },
    },
  ])('rejects defensive schema result %#', async ({ expectedKind, result }) => {
    const validation = requirePrepared({
      '~standard': {
        validate: () => result,
        vendor: 'fixture',
        version: 1,
      },
    });
    let failure: unknown;
    try {
      await validateConfigValue({ valid: false }, validation, issueContext());
    } catch (error) {
      failure = error;
    }
    expect(captureValidationError(failure).details.kind).toBe(expectedKind);
  });

  it('sanitizes schema throws and invalid function output', async () => {
    const throwing = requirePrepared({
      '~standard': {
        validate() {
          throw new Error('fixture-private-cause');
        },
        vendor: 'fixture',
        version: 1,
      },
    });
    const invalidOutput = requirePrepared(() => new Date(0));

    for (const validation of [throwing, invalidOutput]) {
      let failure: unknown;
      try {
        await validateConfigValue({ valid: false }, validation, issueContext());
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeInstanceOf(KasaneValidationError);
      expect(JSON.stringify(failure)).not.toContain('fixture-private-cause');
    }
  });

  it('clones nested arrays/objects before invoking a function validator', async () => {
    const input = { nested: [{ value: 1 }] };
    const validation = requirePrepared((received: unknown) => {
      const clone = received as { nested: { value: number }[] };
      const first = clone.nested[0];
      if (first === undefined) throw new Error('Missing cloned fixture value');
      first.value = 2;
      return clone;
    });
    const output = await validateConfigValue(
      input,
      validation,
      issueContext(input),
    );

    expect(output).toEqual({ nested: [{ value: 2 }] });
    expect(input).toEqual({ nested: [{ value: 1 }] });
  });
});
