import { safeDiagnosticValue } from './safe-json.js';

export const MAX_FORMAT_LENGTH = 100_000;

/** Stable, ANSI-free diagnostic text over an already-safe structured value. */
export function formatDiagnostic(value: unknown): string {
  const formatted = JSON.stringify(safeDiagnosticValue(value), null, 2);
  return formatted.length <= MAX_FORMAT_LENGTH
    ? formatted
    : `${formatted.slice(0, MAX_FORMAT_LENGTH)}\n[TRUNCATED]`;
}
