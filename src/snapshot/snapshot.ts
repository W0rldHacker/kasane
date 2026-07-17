import { inspect } from 'node:util';

import { formatDiagnostic } from '../diagnostics/formatter.js';
import { safeDiagnosticValue } from '../diagnostics/safe-json.js';
import { KasaneError, KasanePathError } from '../errors/index.js';
import type { ConfigNode } from '../normalize/types.js';
import { PathCache, resolvePath } from '../paths/index.js';
import {
  createExplanation,
  resolvePathOrigin,
} from '../provenance/explanation.js';
import type { Explanation, Origin } from '../provenance/explanation.js';
import type { ProvenanceTree } from '../provenance/tree.js';
import { createProvenanceTree } from '../provenance/tree.js';
import type { LayerRegistry } from '../provenance/registry.js';
import { cloneConfigNode, deepFreezeConfigNode } from './freeze.js';
import { createConfigDiff, createSecretFingerprintIndex } from './diff.js';
import type { ConfigDiff, SecretFingerprintIndex } from './diff.js';

export const SNAPSHOT_PATH_CACHE_LIMIT = 256;

export type DeepReadonly<T> = T extends null | boolean | number | string
  ? T
  : T extends readonly (infer Item)[]
    ? readonly DeepReadonly<Item>[]
    : T extends object
      ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
      : T;

/** A structurally safe representation; unlike `value`, it never aliases T. */
export type RedactedConfigNode = ConfigNode;

export type SnapshotRedactor = (
  value: ConfigNode,
  provenance: ProvenanceTree | undefined,
  registry: LayerRegistry | undefined,
) => RedactedConfigNode;

export interface ConfigSnapshotOptions {
  /** Runtime deep-freeze is enabled unless explicitly disabled. */
  readonly freeze?: boolean;
  /** Internal policy hook used by central redaction. */
  readonly redact?: SnapshotRedactor;
  /** Internal immutable metadata, never published as a field. */
  readonly provenance?: ProvenanceTree;
  /** Internal centrally-redacted value retained without provenance. */
  readonly redactedValue?: ConfigNode;
  /** Internal safe source registry retained for diagnostic readers. */
  readonly registry?: LayerRegistry;
  /** Internal current-value digests; the fingerprint key is never retained. */
  readonly secretFingerprints?: SecretFingerprintIndex;
}

/** Immutable read facade over one detached configuration value. */
export class ConfigSnapshot<T = ConfigNode> {
  readonly #cache = new PathCache(SNAPSHOT_PATH_CACHE_LIMIT);
  readonly #provenance: ProvenanceTree | undefined;
  readonly #redact: SnapshotRedactor | undefined;
  readonly #redactedValue: ConfigNode | undefined;
  readonly #registry: LayerRegistry | undefined;
  readonly #secretFingerprints: SecretFingerprintIndex;
  readonly #value: ConfigNode;

  constructor(value: T & ConfigNode, options: ConfigSnapshotOptions = {}) {
    const detached = cloneConfigNode(value);
    this.#value =
      options.freeze === false ? detached : deepFreezeConfigNode(detached);
    this.#provenance = options.provenance;
    this.#redactedValue =
      options.redactedValue === undefined
        ? undefined
        : deepFreezeConfigNode(cloneConfigNode(options.redactedValue));
    this.#registry = options.registry;
    this.#secretFingerprints = new Map(
      options.secretFingerprints ??
        createSecretFingerprintIndex(detached, options.provenance),
    );
    this.#redact = options.redact;
    Object.freeze(this);
  }

  /** The only intentionally raw configuration surface. */
  get value(): DeepReadonly<T> {
    return this.#value as DeepReadonly<T>;
  }

  get(path: string): unknown {
    const result = resolvePath(this.#value, this.#cache.parse(path));
    return result.found ? result.value : undefined;
  }

  has(path: string): boolean {
    return resolvePath(this.#value, this.#cache.parse(path)).found;
  }

  require(path: string): unknown {
    const result = resolvePath(this.#value, this.#cache.parse(path));
    if (result.found) return result.value;

    throw new KasanePathError('Required configuration path is unavailable.', {
      details: { path, kind: 'missing-path', operation: 'require' },
    });
  }

  origin(path: string): Origin | undefined {
    const segments = this.#cache.parse(path);
    if (!resolvePath(this.#value, segments).found) return undefined;
    return resolvePathOrigin(segments, this.#provenance, this.#registry);
  }

  explain(path: string): Explanation {
    const segments = this.#cache.parse(path);
    const resolution = resolvePath(this.#value, segments);
    const redactedResolution =
      this.#redactedValue === undefined
        ? undefined
        : resolvePath(this.#redactedValue, segments);
    return createExplanation({
      format: formatDiagnostic,
      path,
      ...(this.#provenance === undefined
        ? {}
        : { provenance: this.#provenance }),
      redact: (value, provenance) => {
        const subtree =
          provenance === undefined || this.#provenance === undefined
            ? undefined
            : createProvenanceTree(provenance, this.#provenance.mode);
        return safeDiagnosticValue(
          value,
          subtree === undefined ? {} : { provenance: subtree },
        );
      },
      ...(this.#registry === undefined ? {} : { registry: this.#registry }),
      ...(redactedResolution === undefined ? {} : { redactedResolution }),
      resolution,
      root: this.#value,
      segments,
    });
  }

  diff(other: ConfigSnapshot<unknown>): ConfigDiff {
    if (!(other instanceof ConfigSnapshot)) {
      throw new KasaneError('Snapshot diff target is invalid.', {
        details: { kind: 'invalid-snapshot', operation: 'diff' },
      });
    }
    return createConfigDiff(
      {
        fingerprints: this.#secretFingerprints,
        ...(this.#provenance === undefined
          ? {}
          : { provenance: this.#provenance }),
        ...(this.#redactedValue === undefined
          ? {}
          : { redactedValue: this.#redactedValue }),
        ...(this.#registry === undefined ? {} : { registry: this.#registry }),
        value: this.#value,
      },
      {
        fingerprints: other.#secretFingerprints,
        ...(other.#provenance === undefined
          ? {}
          : { provenance: other.#provenance }),
        ...(other.#redactedValue === undefined
          ? {}
          : { redactedValue: other.#redactedValue }),
        ...(other.#registry === undefined ? {} : { registry: other.#registry }),
        value: other.#value,
      },
    );
  }

  toJSON(): RedactedConfigNode {
    if (this.#redactedValue !== undefined) {
      return safeDiagnosticValue(this.#redactedValue) as ConfigNode;
    }
    const context =
      this.#provenance === undefined ? {} : { provenance: this.#provenance };
    const safe = safeDiagnosticValue(this.#value, context) as ConfigNode;
    if (this.#redact === undefined) return safe;

    // Extension hooks receive only already-redacted data. The central pass is
    // repeated over their output so an identity hook cannot bypass policy.
    return safeDiagnosticValue(
      this.#redact(cloneConfigNode(safe), this.#provenance, this.#registry),
      context,
    ) as ConfigNode;
  }

  [inspect.custom](): RedactedConfigNode {
    return this.toJSON();
  }
}
