import { formatDiagnostic } from '../diagnostics/formatter.js';
import type { ConfigIssue } from './issues.js';

/** Stable safe text generated only from normalized ConfigIssue records. */
export function formatValidationIssues(issues: readonly ConfigIssue[]): string {
  return `Configuration validation failed.\n${formatDiagnostic({ issues })}`;
}
