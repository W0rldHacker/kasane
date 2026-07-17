import { isProxy } from 'node:util/types';

import { Redactor } from '../secrets/redact.js';
import type { SecretPathMatcher } from '../secrets/matcher.js';
import type { DiagnosticValue, RedactionContext } from '../secrets/redact.js';

const diagnosticRedactor = new Redactor({ unsafeObject: isProxy });

/** Produces a detached, JSON-safe diagnostic tree without invoking value hooks. */
export function safeDiagnosticValue(
  value: unknown,
  context: RedactionContext = {},
): DiagnosticValue {
  return diagnosticRedactor.redact(value, context);
}

export function safeStringify(
  value: unknown,
  context: RedactionContext = {},
): string {
  return JSON.stringify(safeDiagnosticValue(value, context));
}

/** Internal bridge for provenance-free snapshots; input must be normalized. */
export function safeNormalizedRedaction(
  value: unknown,
  policy: SecretPathMatcher,
  preserve: (value: unknown) => boolean,
): unknown {
  return diagnosticRedactor.redactNormalized(value, policy, preserve);
}
