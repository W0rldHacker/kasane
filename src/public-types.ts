import type { KasaneEventCallback } from './diagnostics/events.js';
import type { ConfigNode } from './normalize/types.js';
import type { MergeStrategy, ProvenanceMode } from './merge/index.js';
import type { ConfigDiff } from './snapshot/diff.js';
import type { Explanation, Origin } from './provenance/explanation.js';
import type { LayerDescriptor } from './layers/types.js';
import type { FingerprintKey } from './secrets/fingerprint.js';
import type { KasaneLimits } from './security/limits.js';
import type { ValidationAdapter } from './validation/index.js';

/** Recursively makes configuration data immutable. */
export type DeepReadonly<T> = T extends null | boolean | number | string
  ? T
  : T extends (...arguments_: never[]) => unknown
    ? T
    : T extends readonly (infer Item)[]
      ? number extends T['length']
        ? readonly DeepReadonly<Item>[]
        : { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
      : T extends object
        ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
        : T;

/** A structurally safe representation; unlike `value`, it never aliases T. */
export type RedactedConfigNode = ConfigNode;

/** Public immutable snapshot contract. */
export interface ConfigSnapshot<T = ConfigNode> {
  /** Deeply frozen, readonly configuration value. */
  readonly value: DeepReadonly<T>;

  /**
   * Reads a runtime string path.
   *
   * Paths intentionally avoid recursive TypeScript path types, so the result
   * remains `unknown` even when `path` is a string literal.
   */
  readonly get: (path: string) => unknown;

  /** Returns whether a runtime string path exists. */
  readonly has: (path: string) => boolean;

  /** Reads a required runtime path or throws a sanitized Kasane error. */
  readonly require: (path: string) => unknown;

  /** Returns the winning origin when provenance was recorded. */
  readonly origin: (path: string) => Origin | undefined;

  /** Explains one runtime path without exposing secret values. */
  readonly explain: (path: string) => Explanation;

  /** Computes a bounded, redacted diff against another snapshot. */
  readonly diff: (other: ConfigSnapshot<unknown>) => ConfigDiff;

  /** Serializes a redacted configuration tree. */
  readonly toJSON: () => RedactedConfigNode;
}

/** Public constructor surface for the runtime `ConfigSnapshot` export. */
export interface ConfigSnapshotConstructor {
  new <T = ConfigNode>(value: T & ConfigNode): ConfigSnapshot<T>;
  readonly prototype: ConfigSnapshot;
}

/** Declarative path-specific merge rules. */
export type MergeRuleDeclarations = Readonly<Record<string, MergeStrategy>>;

/** Options accepted by {@link kasane}. */
export interface KasaneOptions<
  Validation extends ValidationAdapter | undefined =
    ValidationAdapter | undefined,
> {
  /** Ordered configuration layers. */
  readonly layers: readonly LayerDescriptor[];
  /** Base directory used by relative-path sources. */
  readonly cwd?: string;
  /** Key used to fingerprint secret values in provenance metadata. */
  readonly fingerprintKey?: FingerprintKey;
  /** Whether the detached snapshot value is frozen at runtime. */
  readonly freeze?: boolean;
  /** Resource and formatting limits. */
  readonly limits?: KasaneLimits;
  /** Path-specific merge strategy declarations. */
  readonly merge?: MergeRuleDeclarations;
  /** Synchronous, isolated lifecycle observer. */
  readonly onEvent?: KasaneEventCallback;
  /** Provenance retention mode. */
  readonly provenance?: ProvenanceMode;
  /** Runtime paths treated as secrets. */
  readonly secrets?: readonly string[];
  /** Abort signal for the complete load pipeline. */
  readonly signal?: AbortSignal;
  /** Validation adapter. Its output type becomes `snapshot.value`. */
  readonly validate?: Validation;
}
