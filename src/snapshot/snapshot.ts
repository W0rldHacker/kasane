import { KasanePathError } from '../errors/index.js';
import type { ConfigNode } from '../normalize/types.js';
import { PathCache, resolvePath } from '../paths/index.js';
import type { ProvenanceTree } from '../provenance/tree.js';
import type { LayerRegistry } from '../provenance/registry.js';
import { redactSnapshotValue } from '../redaction/index.js';
import { cloneConfigNode, deepFreezeConfigNode } from './freeze.js';

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
  /** Internal safe source registry retained for diagnostic readers. */
  readonly registry?: LayerRegistry;
}

/** Immutable read facade over one detached configuration value. */
export class ConfigSnapshot<T = ConfigNode> {
  readonly #cache = new PathCache(SNAPSHOT_PATH_CACHE_LIMIT);
  readonly #provenance: ProvenanceTree | undefined;
  readonly #redact: SnapshotRedactor;
  readonly #registry: LayerRegistry | undefined;
  readonly #value: ConfigNode;

  constructor(value: T & ConfigNode, options: ConfigSnapshotOptions = {}) {
    const detached = cloneConfigNode(value);
    this.#value =
      options.freeze === false ? detached : deepFreezeConfigNode(detached);
    this.#provenance = options.provenance;
    this.#registry = options.registry;
    this.#redact = options.redact ?? redactSnapshotValue;
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

  toJSON(): RedactedConfigNode {
    // Hooks receive a throwaway raw tree; their result is detached once more so
    // even an identity or accidentally aliasing hook cannot publish internals.
    const input = cloneConfigNode(this.#value);
    return cloneConfigNode(
      this.#redact(input, this.#provenance, this.#registry),
    );
  }
}
