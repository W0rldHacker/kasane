import { remove } from '../../../src/index.js';
import type { MergeStrategy } from '../../../src/index.js';
import { serializeTestPath } from './types.js';
import type {
  CanonicalNode,
  CanonicalObject,
  GeneratedMergeCase,
  LayerNode,
  LayerObject,
} from './types.js';

export type ReferenceOperation =
  'append' | 'merge' | 'prepend' | 'remove' | 'replace' | 'set';

export interface ReferenceOrigin {
  readonly layerIndex: number;
  readonly layerName: string;
  readonly operation: ReferenceOperation;
}

export interface ReferenceTombstone {
  readonly origin: ReferenceOrigin;
  readonly state: 'tombstone';
}

export interface ReferenceLeaf {
  readonly origin: ReferenceOrigin;
  readonly state: 'value';
  readonly type: 'leaf';
  readonly value: null | boolean | number | string;
}

export interface ReferenceArray {
  readonly items: readonly ReferenceValue[];
  readonly origin: ReferenceOrigin;
  readonly state: 'value';
  readonly type: 'array';
}

export interface ReferenceObject {
  readonly fields: ReadonlyMap<string, ReferenceNode>;
  readonly origin: ReferenceOrigin;
  readonly state: 'value';
  readonly type: 'object';
}

export type ReferenceValue = ReferenceArray | ReferenceLeaf | ReferenceObject;
export type ReferenceNode = ReferenceTombstone | ReferenceValue;

export interface ReferenceEntry {
  readonly node: ReferenceValue;
  readonly path: string;
  readonly value: CanonicalNode;
}

export interface ReferenceRemoval {
  readonly node: ReferenceTombstone;
  readonly path: string;
}

export interface ReferenceResult {
  readonly entries: readonly ReferenceEntry[];
  readonly removals: readonly ReferenceRemoval[];
  readonly root: ReferenceValue;
  readonly value: CanonicalNode;
}

function origin(
  layerIndex: number,
  layerName: string,
  operation: ReferenceOperation,
): ReferenceOrigin {
  return { layerIndex, layerName, operation };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function materialize(
  incoming: LayerNode | undefined,
  layerIndex: number,
  layerName: string,
  operation: 'replace' | 'set',
): ReferenceNode | undefined {
  if (incoming === undefined) return undefined;
  if (incoming === remove) {
    return {
      origin: origin(layerIndex, layerName, 'remove'),
      state: 'tombstone',
    };
  }
  if (incoming === null || typeof incoming !== 'object') {
    return {
      origin: origin(layerIndex, layerName, operation),
      state: 'value',
      type: 'leaf',
      value: incoming,
    };
  }
  if (Array.isArray(incoming)) {
    return {
      items: incoming.map((item) =>
        requireValue(materialize(item, layerIndex, layerName, operation)),
      ),
      origin: origin(layerIndex, layerName, operation),
      state: 'value',
      type: 'array',
    };
  }

  const fields = new Map<string, ReferenceNode>();
  for (const key of Object.keys(incoming)) {
    const child = materialize(incoming[key], layerIndex, layerName, operation);
    if (child !== undefined) fields.set(key, child);
  }
  return {
    fields,
    origin: origin(layerIndex, layerName, operation),
    state: 'value',
    type: 'object',
  };
}

function requireValue(node: ReferenceNode | undefined): ReferenceValue {
  if (node === undefined || node.state === 'tombstone') {
    throw new Error(
      'Reference model received a control marker inside an array.',
    );
  }
  return node;
}

function mergeObjects(
  existing: ReferenceObject,
  incoming: LayerObject,
  pathSegments: readonly string[],
  layerIndex: number,
  layerName: string,
  rules: Readonly<Record<string, MergeStrategy>>,
): ReferenceObject {
  const fields = new Map(existing.fields);
  for (const key of Object.keys(incoming)) {
    const child = mergeNode(
      fields.get(key),
      incoming[key],
      [...pathSegments, key],
      layerIndex,
      layerName,
      rules,
    );
    if (child === undefined) fields.delete(key);
    else fields.set(key, child);
  }
  return {
    fields,
    origin: origin(layerIndex, layerName, 'merge'),
    state: 'value',
    type: 'object',
  };
}

function invalidRule(strategy: MergeStrategy, path: string): never {
  throw new Error(
    `Reference rule ${strategy} is invalid at ${path || '<root>'}.`,
  );
}

function mergeNode(
  existing: ReferenceNode | undefined,
  incoming: LayerNode | undefined,
  pathSegments: readonly string[],
  layerIndex: number,
  layerName: string,
  rules: Readonly<Record<string, MergeStrategy>>,
): ReferenceNode | undefined {
  if (incoming === undefined) return existing;
  if (incoming === remove) {
    return {
      origin: origin(layerIndex, layerName, 'remove'),
      state: 'tombstone',
    };
  }
  if (existing === undefined || existing.state === 'tombstone') {
    return materialize(incoming, layerIndex, layerName, 'set');
  }

  const path = serializeTestPath(pathSegments);
  const strategy = rules[path];
  if (strategy === 'replace') {
    return materialize(incoming, layerIndex, layerName, 'replace');
  }
  if (strategy === 'merge') {
    if (existing.type !== 'object' || !isObject(incoming)) {
      return invalidRule(strategy, path);
    }
    return mergeObjects(
      existing,
      incoming,
      pathSegments,
      layerIndex,
      layerName,
      rules,
    );
  }
  if (strategy === 'append' || strategy === 'prepend') {
    if (existing.type !== 'array' || !Array.isArray(incoming)) {
      return invalidRule(strategy, path);
    }
    const added = incoming.map((item) =>
      requireValue(materialize(item, layerIndex, layerName, 'set')),
    );
    return {
      items:
        strategy === 'append'
          ? [...existing.items, ...added]
          : [...added, ...existing.items],
      origin: origin(layerIndex, layerName, strategy),
      state: 'value',
      type: 'array',
    };
  }

  if (existing.type === 'object' && isObject(incoming)) {
    return mergeObjects(
      existing,
      incoming,
      pathSegments,
      layerIndex,
      layerName,
      rules,
    );
  }
  return materialize(incoming, layerIndex, layerName, 'replace');
}

function toValue(node: ReferenceValue): CanonicalNode {
  if (node.type === 'leaf') return node.value;
  if (node.type === 'array') return node.items.map((item) => toValue(item));

  const output: CanonicalObject = {};
  for (const [key, child] of node.fields) {
    if (child.state === 'value') output[key] = toValue(child);
  }
  return output;
}

function collect(
  node: ReferenceNode,
  segments: readonly string[],
  entries: ReferenceEntry[],
  removals: ReferenceRemoval[],
): void {
  const path = serializeTestPath(segments);
  if (node.state === 'tombstone') {
    removals.push({ node, path });
    return;
  }

  entries.push({ node, path, value: toValue(node) });
  if (node.type === 'array') {
    node.items.forEach((child, index) => {
      collect(child, [...segments, String(index)], entries, removals);
    });
  } else if (node.type === 'object') {
    for (const [key, child] of node.fields) {
      collect(child, [...segments, key], entries, removals);
    }
  }
}

export function interpretMerge(fixture: GeneratedMergeCase): ReferenceResult {
  let current: ReferenceNode | undefined;
  fixture.layers.forEach((layer, layerIndex) => {
    current = mergeNode(
      current,
      layer.value,
      [],
      layerIndex,
      layer.name,
      fixture.rules,
    );
  });

  const root = requireValue(current);
  const entries: ReferenceEntry[] = [];
  const removals: ReferenceRemoval[] = [];
  collect(root, [], entries, removals);
  return { entries, removals, root, value: toValue(root) };
}
