import { KasaneLayerError, KasaneSourceError } from '../errors/index.js';
import { isSafeConfigKey } from '../normalize/safe-key.js';
import { parsePath, serializePath } from '../paths/index.js';
import type { SourceMetadata } from '../sources/index.js';

export type EnvParser<Output = unknown> = (
  value: string,
) => Output | Promise<Output>;

export interface EnvMapEntry<Output = unknown> {
  readonly path: string;
  readonly parse?: EnvParser<Output>;
}

export type EnvMap = Readonly<Record<string, string | Readonly<EnvMapEntry>>>;

export type EnvSource = Readonly<Record<string, string | undefined>>;
export type EnvCase = 'lower' | 'preserve';
export type EnvCoercion = false | 'json';

interface ExplicitEntry {
  readonly parse?: EnvParser;
  readonly path: string;
}

export interface PreparedEnvOptions {
  readonly casing: EnvCase;
  readonly coerce: EnvCoercion;
  readonly explicitMap?: ReadonlyMap<string, ExplicitEntry>;
  readonly prefix: string;
  readonly separator: string;
}

interface SnapshotEntry {
  readonly name: string;
  readonly value: string;
}

interface MappingEntry extends SnapshotEntry {
  readonly mode: 'explicit' | 'prefix';
  readonly originalSegments: readonly string[];
  readonly parse?: EnvParser;
  readonly path: string;
  readonly segments: readonly string[];
}

export interface MappedEnv {
  readonly metadata: SourceMetadata;
  readonly value: unknown;
}

interface CollisionNode {
  readonly children: Map<string, CollisionNode>;
  terminal?: MappingEntry;
}

function failLayer(kind: string): never {
  throw new KasaneLayerError('Environment layer declaration is invalid.', {
    details: { kind, operation: 'create-env-layer' },
  });
}

function failSource(
  kind: string,
  entry?: Readonly<{ name?: string; path?: string }>,
  cause?: unknown,
): never {
  throw new KasaneSourceError('Environment source could not be mapped.', {
    ...(cause === undefined ? {} : { cause }),
    details: {
      kind,
      operation: 'map-env',
      ...(entry?.name === undefined ? {} : { reference: entry.name }),
      ...(entry?.path === undefined ? {} : { path: entry.path }),
    },
  });
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function prepareExplicitMap(
  value: unknown,
): ReadonlyMap<string, ExplicitEntry> | undefined {
  if (value === undefined) return undefined;
  if (!isObject(value)) return failLayer('invalid-env-map');

  const prepared = new Map<string, ExplicitEntry>();
  for (const variable of Object.keys(value).sort()) {
    const declaration = value[variable];
    if (typeof declaration === 'string') {
      prepared.set(variable, Object.freeze({ path: declaration }));
      continue;
    }
    if (!isObject(declaration) || typeof declaration['path'] !== 'string') {
      return failLayer('invalid-env-map-entry');
    }

    const parse = declaration['parse'];
    if (parse !== undefined && typeof parse !== 'function') {
      return failLayer('invalid-env-map-parser');
    }
    prepared.set(
      variable,
      Object.freeze({
        path: declaration['path'],
        ...(parse === undefined ? {} : { parse: parse as EnvParser }),
      }),
    );
  }
  return prepared;
}

function snapshotSource(source: EnvSource): readonly SnapshotEntry[] {
  let keys: string[];
  try {
    keys = Object.keys(source).sort();
  } catch (cause) {
    return failSource('uninspectable-env-source', undefined, cause);
  }

  const snapshot: SnapshotEntry[] = [];
  for (const name of keys) {
    let value: unknown;
    try {
      value = source[name];
    } catch (cause) {
      return failSource('unreadable-env-variable', { name }, cause);
    }
    if (value === undefined) continue;
    if (typeof value !== 'string') {
      return failSource('non-string-env-value', { name });
    }
    snapshot.push(Object.freeze({ name, value }));
  }
  return Object.freeze(snapshot);
}

function validateSegments(name: string, segments: readonly string[]): void {
  for (const segment of segments) {
    if (segment.length === 0) return failSource('empty-env-segment', { name });
    if (!isSafeConfigKey(segment)) {
      return failSource('dangerous-env-segment', { name });
    }
  }
}

function prefixMappings(
  snapshot: readonly SnapshotEntry[],
  options: PreparedEnvOptions,
): readonly MappingEntry[] {
  const mappings: MappingEntry[] = [];
  for (const entry of snapshot) {
    if (!entry.name.startsWith(options.prefix)) continue;

    const suffix = entry.name.slice(options.prefix.length);
    const originalSegments = suffix.split(options.separator);
    const segments =
      options.casing === 'lower'
        ? originalSegments.map((segment) => segment.toLowerCase())
        : originalSegments;
    validateSegments(entry.name, segments);
    mappings.push(
      Object.freeze({
        ...entry,
        mode: 'prefix',
        originalSegments: Object.freeze([...originalSegments]),
        path: serializePath(segments),
        segments: Object.freeze([...segments]),
      }),
    );
  }
  return mappings;
}

function explicitMappings(
  snapshot: readonly SnapshotEntry[],
  explicitMap: ReadonlyMap<string, ExplicitEntry>,
): readonly MappingEntry[] {
  const mappings: MappingEntry[] = [];
  for (const entry of snapshot) {
    const declaration = explicitMap.get(entry.name);
    if (declaration === undefined) continue;

    let segments: readonly string[];
    try {
      segments = parsePath(declaration.path);
    } catch (cause) {
      return failSource(
        'invalid-env-map-path',
        { name: entry.name, path: declaration.path },
        cause,
      );
    }
    validateSegments(entry.name, segments);
    mappings.push(
      Object.freeze({
        ...entry,
        mode: 'explicit',
        originalSegments: segments,
        path: serializePath(segments),
        segments,
        ...(declaration.parse === undefined
          ? {}
          : { parse: declaration.parse }),
      }),
    );
  }
  return mappings;
}

function compareMappings(left: MappingEntry, right: MappingEntry): number {
  if (left.path < right.path) return -1;
  if (left.path > right.path) return 1;
  if (left.name < right.name) return -1;
  if (left.name > right.name) return 1;
  return 0;
}

function sameSegments(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return (
    left.length === right.length &&
    left.every((segment, index) => segment === right[index])
  );
}

function collisionKind(first: MappingEntry, second: MappingEntry): string {
  return first.mode === 'prefix' &&
    second.mode === 'prefix' &&
    !sameSegments(first.originalSegments, second.originalSegments)
    ? 'env-case-collision'
    : 'duplicate-env-path';
}

function validateCollisions(mappings: readonly MappingEntry[]): void {
  const root: CollisionNode = { children: new Map() };
  for (const entry of [...mappings].sort(compareMappings)) {
    let node = root;
    for (const segment of entry.segments) {
      if (node.terminal !== undefined) {
        return failSource('env-parent-child-collision', {
          name: entry.name,
          path: entry.path,
        });
      }
      let child = node.children.get(segment);
      if (child === undefined) {
        child = { children: new Map() };
        node.children.set(segment, child);
      }
      node = child;
    }

    if (node.terminal !== undefined) {
      return failSource(collisionKind(node.terminal, entry), {
        name: entry.name,
        path: entry.path,
      });
    }
    if (node.children.size > 0) {
      return failSource('env-parent-child-collision', {
        name: entry.name,
        path: entry.path,
      });
    }
    node.terminal = entry;
  }
}

function coerceJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

async function parseValue(
  entry: MappingEntry,
  coerce: EnvCoercion,
): Promise<unknown> {
  if (entry.parse !== undefined) {
    try {
      return await entry.parse(entry.value);
    } catch (cause) {
      return failSource(
        'env-map-parse-error',
        { name: entry.name, path: entry.path },
        cause,
      );
    }
  }
  return coerce === 'json' ? coerceJson(entry.value) : entry.value;
}

function defineValue(
  target: Record<string, unknown>,
  key: string,
  value: unknown,
): void {
  Object.defineProperty(target, key, {
    configurable: true,
    enumerable: true,
    value,
    writable: true,
  });
}

async function materialize(
  mappings: readonly MappingEntry[],
  coerce: EnvCoercion,
): Promise<unknown> {
  if (mappings.length === 1 && mappings[0]?.segments.length === 0) {
    return parseValue(mappings[0], coerce);
  }

  const root: Record<string, unknown> = {};
  for (const entry of mappings) {
    let target = root;
    for (let index = 0; index < entry.segments.length - 1; index += 1) {
      const segment = entry.segments[index];
      if (segment === undefined) continue;
      const existing = target[segment];
      if (typeof existing === 'object' && existing !== null) {
        target = existing as Record<string, unknown>;
      } else {
        const child: Record<string, unknown> = {};
        defineValue(target, segment, child);
        target = child;
      }
    }
    const leaf = entry.segments.at(-1);
    if (leaf !== undefined) {
      defineValue(target, leaf, await parseValue(entry, coerce));
    }
  }
  return root;
}

/** Snapshots, validates, maps, and materializes one env source invocation. */
export async function mapEnvSource(
  source: EnvSource,
  options: PreparedEnvOptions,
): Promise<MappedEnv> {
  const snapshot = snapshotSource(source);
  const mappings =
    options.explicitMap === undefined
      ? prefixMappings(snapshot, options)
      : explicitMappings(snapshot, options.explicitMap);
  validateCollisions(mappings);

  const ordered = [...mappings].sort((left, right) =>
    left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
  );
  const metadata: SourceMetadata = Object.freeze({
    inputReferences: Object.freeze(ordered.map((entry) => entry.name)),
    pathReferences: Object.freeze(
      ordered.map((entry) =>
        Object.freeze({ path: entry.path, reference: entry.name }),
      ),
    ),
  });

  return Object.freeze({
    metadata,
    value: await materialize(ordered, options.coerce),
  });
}
