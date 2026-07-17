import { KasaneValidationError } from '../errors/index.js';
import { readSafeDataProperty } from '../diagnostics/safe-data.js';
import { normalizeConfigNode } from '../normalize/index.js';
import type { NormalizeLimits } from '../normalize/index.js';
import type { ConfigNode } from '../normalize/types.js';
import {
  createRootConfigIssue,
  normalizeStandardSchemaIssues,
} from './issues.js';
import type { ConfigIssueContext } from './issues.js';
import { isStandardSchemaV1 } from './standard-schema.js';
import type { StandardSchemaV1 } from './standard-schema.js';
import { createValidationError } from './validation-error.js';

export type FunctionValidator<Output = unknown> = (
  value: unknown,
) => Output | Promise<Output>;

export type ValidationAdapter = FunctionValidator | StandardSchemaV1;

export type InferValidationOutput<Validation> = Validation extends (
  ...arguments_: never[]
) => infer Output
  ? Awaited<Output>
  : Validation extends StandardSchemaV1<unknown, infer Output>
    ? Output
    : never;

export type PreparedValidation =
  | Readonly<{
      kind: 'function';
      validate: FunctionValidator;
    }>
  | Readonly<{
      kind: 'standard-schema';
      schema: StandardSchemaV1;
    }>;

function validationError(kind: string, cause?: unknown): never {
  throw new KasaneValidationError('Configuration validation failed.', {
    ...(cause === undefined ? {} : { cause }),
    details: { kind, operation: 'validate' },
    secret: cause !== undefined,
  });
}

/** Detects the validator shape without importing a schema implementation. */
export function prepareValidation(
  input: unknown,
): PreparedValidation | undefined {
  if (input === undefined) return undefined;
  if (isStandardSchemaV1(input)) {
    return Object.freeze({ kind: 'standard-schema', schema: input });
  }
  if (typeof input === 'function') {
    return Object.freeze({
      kind: 'function',
      validate: input as FunctionValidator,
    });
  }
  return validationError('unsupported-validator');
}

function cloneValidationInput(value: ConfigNode | undefined): unknown {
  if (typeof value !== 'object' || value === null) return value;
  if (Array.isArray(value)) {
    return value.map((child) => cloneValidationInput(child));
  }

  const output: Record<string, unknown> = {};
  for (const key of Object.keys(value)) {
    Object.defineProperty(output, key, {
      configurable: true,
      enumerable: true,
      value: cloneValidationInput(value[key]),
      writable: true,
    });
  }
  return output;
}

type StandardResult =
  | Readonly<{ kind: 'failure'; issues: unknown }>
  | Readonly<{ kind: 'invalid' }>
  | Readonly<{ kind: 'success'; value: unknown }>;

function standardResult(result: unknown): StandardResult {
  const issues = readSafeDataProperty(result, 'issues');
  if (issues.kind === 'unsafe') return { kind: 'invalid' };
  if (issues.kind === 'data' && issues.value !== undefined) {
    return { issues: issues.value, kind: 'failure' };
  }

  const value = readSafeDataProperty(result, 'value');
  return value.kind === 'data'
    ? { kind: 'success', value: value.value }
    : { kind: 'invalid' };
}

async function invokeValidation(
  validation: PreparedValidation,
  input: unknown,
  diagnostics: ConfigIssueContext,
): Promise<unknown> {
  if (validation.kind === 'function') {
    try {
      return await validation.validate(input);
    } catch (cause) {
      throw createValidationError(
        'validator-threw',
        createRootConfigIssue(diagnostics),
        cause,
      );
    }
  }

  let result: unknown;
  try {
    const properties = validation.schema['~standard'];
    result = await properties.validate(input);
  } catch (cause) {
    throw createValidationError(
      'validator-threw',
      createRootConfigIssue(diagnostics),
      cause,
    );
  }
  const parsed = standardResult(result);
  if (parsed.kind === 'invalid') {
    throw createValidationError(
      'invalid-standard-schema-result',
      createRootConfigIssue(diagnostics),
    );
  }
  if (parsed.kind === 'failure') {
    const issues = normalizeStandardSchemaIssues(parsed.issues, diagnostics);
    if (issues === undefined) {
      throw createValidationError(
        'invalid-standard-schema-result',
        createRootConfigIssue(diagnostics),
      );
    }
    throw createValidationError('standard-schema-failure', issues);
  }
  return parsed.value;
}

/** Invokes trusted validator code and re-normalizes its untrusted output. */
export async function validateConfigValue(
  value: ConfigNode | undefined,
  validation: PreparedValidation,
  diagnostics: ConfigIssueContext,
  limits?: NormalizeLimits,
): Promise<ConfigNode | undefined> {
  const output = await invokeValidation(
    validation,
    cloneValidationInput(value),
    diagnostics,
  );
  try {
    return normalizeConfigNode(output, limits);
  } catch (cause) {
    throw createValidationError(
      'invalid-validator-output',
      createRootConfigIssue(diagnostics),
      cause,
    );
  }
}
