import { safeDiagnosticValue } from './safe-json.js';
import type { DiagnosticValue } from './safe-json.js';

export const MAX_FORMAT_LENGTH = 100_000;
export const FORMAT_TRUNCATION_MARKER = '[TRUNCATED]';

const STOP_FORMATTING = new Error('Diagnostic formatting budget exhausted.');

function isDiagnosticArray(
  value: DiagnosticValue,
): value is readonly DiagnosticValue[] {
  return Array.isArray(value);
}

function primitiveJson(value: DiagnosticValue): string {
  return JSON.stringify(value);
}

function renderDiagnostic(
  value: DiagnosticValue,
  depth: number,
  append: (value: string) => void,
): void {
  if (typeof value !== 'object' || value === null) {
    append(primitiveJson(value));
    return;
  }

  const array = isDiagnosticArray(value);
  let entries: readonly (readonly [string, DiagnosticValue])[];
  if (array) {
    entries = value.map((child, index) => [String(index), child] as const);
  } else {
    entries = Object.keys(value).map(
      (key) => [key, value[key] as DiagnosticValue] as const,
    );
  }
  const open = array ? '[' : '{';
  const close = array ? ']' : '}';
  append(open);
  if (entries.length === 0) {
    append(close);
    return;
  }

  const childIndent = '  '.repeat(depth + 1);
  const closingIndent = '  '.repeat(depth);
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (entry === undefined) continue;
    append(`\n${childIndent}`);
    if (!array) append(`${primitiveJson(entry[0])}: `);
    renderDiagnostic(entry[1], depth + 1, append);
    if (index < entries.length - 1) append(',');
  }
  append(`\n${closingIndent}${close}`);
}

/** Stable, ANSI-free diagnostic text over an already-safe structured value. */
export function formatDiagnostic(value: unknown): string {
  let formatted = '';
  const append = (part: string): void => {
    const remaining = MAX_FORMAT_LENGTH - formatted.length;
    if (part.length <= remaining) {
      formatted += part;
      return;
    }
    if (remaining > 0) formatted += part.slice(0, remaining);
    throw STOP_FORMATTING;
  };

  try {
    renderDiagnostic(safeDiagnosticValue(value), 0, append);
    return formatted;
  } catch (cause) {
    if (cause !== STOP_FORMATTING) throw cause;
    return `${formatted}\n${FORMAT_TRUNCATION_MARKER}`;
  }
}
