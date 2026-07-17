import { inspect } from 'node:util';
import { isProxy } from 'node:util/types';

import { safeDiagnosticValue } from '../diagnostics/safe-json.js';
import type { ConfigIssue } from '../validation/issues.js';

const MAX_LIMIT_ENTRIES = 16;
const SAFE_LIMIT_NAME = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/u;
const SAFE_CAUSE_NAME = /^(?:Error|[A-Za-z][A-Za-z0-9]{0,62}Error)$/u;
const safeExternalCauseNames = new Set([
  'AggregateError',
  'Error',
  'EvalError',
  'RangeError',
  'ReferenceError',
  'SyntaxError',
  'TypeError',
  'URIError',
]);
const unsafePropertyNames = new Set(['__proto__', 'constructor', 'prototype']);
const safeErrors = new WeakSet<object>();

interface ErrorMetadata {
  readonly code: string;
  readonly defaultMessage: string;
  readonly name: string;
}

const baseMetadata: ErrorMetadata = Object.freeze({
  code: 'KASANE_ERROR',
  defaultMessage: 'Kasane operation failed.',
  name: 'KasaneError',
});
const metadataByConstructor = new Map<object, ErrorMetadata>();

export interface KasaneErrorDetailsInput {
  readonly path?: string;
  readonly layerId?: number;
  readonly layerName?: string;
  readonly kind?: string;
  readonly operation?: string;
  readonly reference?: string;
  readonly limits?: Readonly<Record<string, number>>;
}

export interface KasaneErrorOptions {
  readonly details?: KasaneErrorDetailsInput;
  readonly cause?: unknown;
  /** Omits even a library-controlled cause message in a secret context. */
  readonly secret?: boolean;
}

export interface KasaneErrorDetails {
  readonly path?: string;
  readonly layerId?: number;
  readonly layerName?: string;
  readonly kind?: string;
  readonly operation?: string;
  readonly reference?: string;
  readonly limits?: Readonly<Record<string, number>>;
}

export interface KasaneCauseSummary {
  readonly name: string;
  readonly code?: string;
  readonly message?: string;
}

export interface KasaneErrorJson {
  readonly name: string;
  readonly code: string;
  readonly message: string;
  readonly details: KasaneErrorDetails;
  readonly cause?: KasaneCauseSummary;
}

const emptyDetails: KasaneErrorDetails = Object.freeze({});

function isObject(value: unknown): value is object {
  return (
    (typeof value === 'object' && value !== null) || typeof value === 'function'
  );
}

function readOwnDataProperty(value: object, property: PropertyKey): unknown {
  if (isProxy(value)) return undefined;

  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, property);
    return descriptor && 'value' in descriptor ? descriptor.value : undefined;
  } catch {
    return undefined;
  }
}

function readOptions(options: KasaneErrorOptions | undefined): {
  readonly cause?: unknown;
  readonly details?: unknown;
  readonly secret: boolean;
} {
  if (!isObject(options) || isProxy(options)) return { secret: false };

  const cause = readOwnDataProperty(options, 'cause');
  const details = readOwnDataProperty(options, 'details');
  const secret = readOwnDataProperty(options, 'secret') === true;

  return { cause, details, secret };
}

function copyStringProperty(
  source: object,
  target: {
    path?: string;
    layerName?: string;
    kind?: string;
    operation?: string;
    reference?: string;
  },
  property: Exclude<keyof KasaneErrorDetailsInput, 'layerId' | 'limits'>,
): void {
  const value = readOwnDataProperty(source, property);
  if (typeof value !== 'string') return;

  target[property] = value;
}

function copyLayerIdProperty(
  source: object,
  target: { layerId?: number },
): void {
  const value = readOwnDataProperty(source, 'layerId');
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) {
    target.layerId = value;
  }
}

function sanitizeLimits(
  value: unknown,
): Readonly<Record<string, number>> | undefined {
  if (!isObject(value) || isProxy(value)) return undefined;

  let names: string[];
  try {
    names = Object.getOwnPropertyNames(value).sort();
  } catch {
    return undefined;
  }

  const limits: Record<string, number> = {};
  let count = 0;

  for (const name of names) {
    if (count === MAX_LIMIT_ENTRIES) break;
    if (unsafePropertyNames.has(name) || !SAFE_LIMIT_NAME.test(name)) continue;

    const limit = readOwnDataProperty(value, name);
    if (typeof limit !== 'number' || !Number.isFinite(limit)) continue;

    limits[name] = limit;
    count += 1;
  }

  return count === 0 ? undefined : Object.freeze(limits);
}

function sanitizeDetails(value: unknown): KasaneErrorDetails {
  if (!isObject(value) || isProxy(value)) return emptyDetails;

  const details: {
    path?: string;
    layerId?: number;
    layerName?: string;
    kind?: string;
    operation?: string;
    reference?: string;
    limits?: Readonly<Record<string, number>>;
  } = {};
  copyLayerIdProperty(value, details);
  copyStringProperty(value, details, 'path');
  copyStringProperty(value, details, 'layerName');
  copyStringProperty(value, details, 'kind');
  copyStringProperty(value, details, 'operation');
  copyStringProperty(value, details, 'reference');

  const limits = sanitizeLimits(readOwnDataProperty(value, 'limits'));
  if (limits) details.limits = limits;

  return Object.keys(details).length === 0
    ? emptyDetails
    : Object.freeze(details);
}

function causeName(value: unknown): string {
  if (!isObject(value) || isProxy(value)) return 'ExternalError';

  let current: object | null = value;
  for (let depth = 0; current !== null && depth < 4; depth += 1) {
    if (isProxy(current)) return 'ExternalError';

    const name = readOwnDataProperty(current, 'name');
    if (typeof name === 'string' && safeExternalCauseNames.has(name)) {
      return name;
    }

    try {
      current = Object.getPrototypeOf(current) as object | null;
    } catch {
      return 'ExternalError';
    }
  }

  return 'ExternalError';
}

function sanitizeCause(
  cause: unknown,
  secret: boolean,
): KasaneCauseSummary | undefined {
  if (cause === undefined) return undefined;

  if (isObject(cause) && safeErrors.has(cause)) {
    const name = readOwnDataProperty(cause, 'name');
    const code = readOwnDataProperty(cause, 'code');
    const message = readOwnDataProperty(cause, 'message');
    const summary: {
      name: string;
      code?: string;
      message?: string;
    } = {
      name:
        typeof name === 'string' && SAFE_CAUSE_NAME.test(name)
          ? name
          : 'KasaneError',
    };

    if (typeof code === 'string') summary.code = code;
    if (!secret && typeof message === 'string') summary.message = message;
    return Object.freeze(summary);
  }

  return Object.freeze({ name: causeName(cause) });
}

function errorMetadataFor(errorConstructor: object): ErrorMetadata {
  let current: object | null = errorConstructor;

  while (current !== null) {
    const metadata = metadataByConstructor.get(current);
    if (metadata) return metadata;

    try {
      const parent: unknown = Object.getPrototypeOf(current);
      current = isObject(parent) ? parent : null;
    } catch {
      return baseMetadata;
    }
  }

  return baseMetadata;
}

/**
 * Base class for every public Kasane failure.
 *
 * `code` is the stable, readonly machine identifier `KASANE_ERROR`. Subclasses
 * replace it with their own documented category code. Messages passed to the
 * constructor must be library-authored diagnostics and must never contain a
 * configuration value.
 */
export class KasaneError extends Error {
  /** Stable readonly machine identifier for this error category. */
  readonly code!: string;

  /** Detached, allowlisted, runtime-immutable diagnostic context. */
  readonly details!: KasaneErrorDetails;

  /** Detached sanitized summary. The original arbitrary cause is discarded. */
  override readonly cause?: KasaneCauseSummary;

  constructor(message?: string, options?: KasaneErrorOptions) {
    const metadata = errorMetadataFor(new.target);
    const safeMessage = message ?? metadata.defaultMessage;
    super(safeMessage);

    Object.setPrototypeOf(this, new.target.prototype);
    Object.defineProperties(this, {
      code: {
        configurable: false,
        enumerable: true,
        value: metadata.code,
        writable: false,
      },
      message: {
        configurable: false,
        enumerable: false,
        value: safeMessage,
        writable: false,
      },
      name: {
        configurable: false,
        enumerable: false,
        value: metadata.name,
        writable: false,
      },
    });

    const sanitizedOptions = readOptions(options);
    const details = sanitizeDetails(sanitizedOptions.details);
    Object.defineProperty(this, 'details', {
      configurable: false,
      enumerable: true,
      value: details,
      writable: false,
    });

    const cause = sanitizeCause(
      sanitizedOptions.cause,
      sanitizedOptions.secret,
    );
    if (cause) {
      Object.defineProperty(this, 'cause', {
        configurable: false,
        enumerable: true,
        value: cause,
        writable: false,
      });
    }

    safeErrors.add(this);
    Error.captureStackTrace(this, new.target);
  }

  toJSON(): KasaneErrorJson {
    const json: {
      name: string;
      code: string;
      message: string;
      details: KasaneErrorDetails;
      cause?: KasaneCauseSummary;
    } = {
      name: this.name,
      code: this.code,
      message: this.message,
      details: this.details,
    };

    if (this.cause) json.cause = this.cause;
    return safeDiagnosticValue(json) as unknown as KasaneErrorJson;
  }

  [inspect.custom](): KasaneErrorJson {
    return this.toJSON();
  }
}

/** `KASANE_LAYER_ERROR`: an invalid layer declaration or registry operation. */
export class KasaneLayerError extends KasaneError {}

/** `KASANE_SOURCE_ERROR`: a layer source could not be loaded or interpreted. */
export class KasaneSourceError extends KasaneError {}

/** `KASANE_MERGE_ERROR`: normalization or merge could not produce valid data. */
export class KasaneMergeError extends KasaneError {}

/** `KASANE_VALIDATION_ERROR`: configuration validation did not succeed. */
export class KasaneValidationError extends KasaneError {
  /** Present on validator failures enriched with normalized issue context. */
  declare readonly issues?: readonly ConfigIssue[];
}

/** `KASANE_PATH_ERROR`: a requested configuration path is invalid or missing. */
export class KasanePathError extends KasaneError {}

/** `KASANE_SECURITY_ERROR`: a security policy or resource limit was violated. */
export class KasaneSecurityError extends KasaneError {}

metadataByConstructor.set(KasaneError, baseMetadata);
metadataByConstructor.set(
  KasaneLayerError,
  Object.freeze({
    code: 'KASANE_LAYER_ERROR',
    defaultMessage: 'Layer declaration is invalid.',
    name: 'KasaneLayerError',
  }),
);
metadataByConstructor.set(
  KasaneSourceError,
  Object.freeze({
    code: 'KASANE_SOURCE_ERROR',
    defaultMessage: 'Layer source failed.',
    name: 'KasaneSourceError',
  }),
);
metadataByConstructor.set(
  KasaneMergeError,
  Object.freeze({
    code: 'KASANE_MERGE_ERROR',
    defaultMessage: 'Configuration merge failed.',
    name: 'KasaneMergeError',
  }),
);
metadataByConstructor.set(
  KasaneValidationError,
  Object.freeze({
    code: 'KASANE_VALIDATION_ERROR',
    defaultMessage: 'Configuration validation failed.',
    name: 'KasaneValidationError',
  }),
);
metadataByConstructor.set(
  KasanePathError,
  Object.freeze({
    code: 'KASANE_PATH_ERROR',
    defaultMessage: 'Configuration path is unavailable.',
    name: 'KasanePathError',
  }),
);
metadataByConstructor.set(
  KasaneSecurityError,
  Object.freeze({
    code: 'KASANE_SECURITY_ERROR',
    defaultMessage: 'Configuration security policy rejected the operation.',
    name: 'KasaneSecurityError',
  }),
);
