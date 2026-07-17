import { safeDiagnosticValue } from '../diagnostics/safe-json.js';
import {
  KasaneValidationError,
  type KasaneErrorJson,
} from '../errors/kasane-error.js';
import { formatValidationIssues } from './formatter.js';
import type { ConfigIssue } from './issues.js';

export interface KasaneValidationErrorJson extends KasaneErrorJson {
  readonly issues: readonly ConfigIssue[];
}

class ProvenanceValidationError extends KasaneValidationError {
  override readonly issues: readonly ConfigIssue[];

  constructor(kind: string, issues: readonly ConfigIssue[], cause?: unknown) {
    const first = issues[0];
    super(formatValidationIssues(issues), {
      ...(cause === undefined ? {} : { cause }),
      details: {
        kind,
        operation: 'validate',
        ...(first === undefined ? {} : { path: first.path }),
        ...(first?.source === undefined
          ? {}
          : {
              layerId: first.source.layer.id,
              layerName: first.source.layer.name,
              reference:
                first.source.inputReference ?? first.source.sourceReference,
            }),
      },
      // Validator-originated causes are always untrusted, including instances
      // of a public Kasane error constructed by consumer code.
      secret: cause !== undefined,
    });
    this.issues = issues;
    Object.defineProperty(this, 'issues', {
      configurable: false,
      enumerable: true,
      value: issues,
      writable: false,
    });
  }

  override toJSON(): KasaneValidationErrorJson {
    return safeDiagnosticValue({
      ...super.toJSON(),
      issues: this.issues,
    }) as unknown as KasaneValidationErrorJson;
  }
}

export function createValidationError(
  kind: string,
  issues: readonly ConfigIssue[],
  cause?: unknown,
): KasaneValidationError {
  return new ProvenanceValidationError(kind, issues, cause);
}
