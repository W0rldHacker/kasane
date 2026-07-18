import type {
  LeafOriginRecord,
  RemoveOriginRecord,
  StructuralOriginRecord,
} from './origin.js';
import type { OriginHistory, StoredProvenanceMode } from './history.js';

export type ContainerKind = 'object' | 'array';
export type { OriginHistory } from './history.js';

interface ValueProvenanceNodeBase {
  readonly state: 'value';
  readonly current: LeafOriginRecord | StructuralOriginRecord;
  readonly secret: boolean;
  readonly history?: OriginHistory;
}

export interface LeafProvenanceNode extends ValueProvenanceNodeBase {
  readonly kind: 'leaf';
  readonly current: LeafOriginRecord;
  /** Validation removals below a path whose current value became a leaf. */
  readonly removedChildren?: ReadonlyMap<string, ProvenanceNode>;
}

export interface ContainerProvenanceNode extends ValueProvenanceNodeBase {
  readonly kind: ContainerKind;
  readonly current: StructuralOriginRecord;
  readonly children: ReadonlyMap<string, ProvenanceNode>;
}

export interface TombstoneProvenanceNode {
  readonly state: 'tombstone';
  readonly kind: 'tombstone';
  readonly removal: RemoveOriginRecord;
  readonly secret: boolean;
  readonly history?: OriginHistory;
}

export type ValueProvenanceNode = LeafProvenanceNode | ContainerProvenanceNode;
export type ProvenanceNode = ValueProvenanceNode | TombstoneProvenanceNode;

export interface ProvenanceTree {
  readonly mode: StoredProvenanceMode;
  readonly root: ProvenanceNode | undefined;
}

class ImmutableChildren implements ReadonlyMap<string, ProvenanceNode> {
  readonly #entries: ReadonlyMap<string, ProvenanceNode>;
  readonly [Symbol.toStringTag] = 'Map';
  readonly size: number;

  constructor(entries: Iterable<readonly [string, ProvenanceNode]>) {
    const copied = new Map<string, ProvenanceNode>();
    for (const [segment, node] of entries) copied.set(segment, node);
    this.#entries = copied;
    this.size = copied.size;
    Object.freeze(this);
  }

  [Symbol.iterator](): MapIterator<[string, ProvenanceNode]> {
    return this.#entries[Symbol.iterator]();
  }

  entries(): MapIterator<[string, ProvenanceNode]> {
    return this.#entries.entries();
  }

  forEach(
    callbackfn: (
      value: ProvenanceNode,
      key: string,
      map: ReadonlyMap<string, ProvenanceNode>,
    ) => void,
    thisArg?: unknown,
  ): void {
    for (const [key, value] of this.#entries) {
      callbackfn.call(thisArg, value, key, this);
    }
  }

  get(key: string): ProvenanceNode | undefined {
    return this.#entries.get(key);
  }

  has(key: string): boolean {
    return this.#entries.has(key);
  }

  keys(): MapIterator<string> {
    return this.#entries.keys();
  }

  values(): MapIterator<ProvenanceNode> {
    return this.#entries.values();
  }
}

const EMPTY_CHILDREN: ReadonlyMap<string, ProvenanceNode> =
  new ImmutableChildren([]);

function copyHistory(
  history: OriginHistory | undefined,
): OriginHistory | undefined {
  return history === undefined ? undefined : Object.freeze([...history]);
}

function nodeHistory(
  history: OriginHistory | undefined,
): Readonly<{ history?: OriginHistory }> {
  const copy = copyHistory(history);
  return copy === undefined ? {} : { history: copy };
}

function immutableChildren(
  children:
    | ReadonlyMap<string, ProvenanceNode>
    | Iterable<readonly [string, ProvenanceNode]>,
): ReadonlyMap<string, ProvenanceNode> {
  if (children instanceof ImmutableChildren) return children;
  return new ImmutableChildren(children);
}

export function createLeafProvenanceNode(
  current: LeafOriginRecord,
  history?: OriginHistory,
  removedChildren?:
    | ReadonlyMap<string, ProvenanceNode>
    | Iterable<readonly [string, ProvenanceNode]>,
): LeafProvenanceNode {
  const removed =
    removedChildren === undefined
      ? undefined
      : immutableChildren(removedChildren);
  return Object.freeze({
    state: 'value',
    kind: 'leaf',
    current,
    secret: current.secret,
    ...nodeHistory(history),
    ...(removed === undefined || removed.size === 0
      ? {}
      : { removedChildren: removed }),
  });
}

export function createContainerProvenanceNode(
  kind: ContainerKind,
  current: StructuralOriginRecord,
  children:
    | ReadonlyMap<string, ProvenanceNode>
    | Iterable<readonly [string, ProvenanceNode]> = EMPTY_CHILDREN,
  history?: OriginHistory,
): ContainerProvenanceNode {
  return Object.freeze({
    state: 'value',
    kind,
    current,
    secret: current.secret,
    children: immutableChildren(children),
    ...nodeHistory(history),
  });
}

export function createTombstoneProvenanceNode(
  removal: RemoveOriginRecord,
  history?: OriginHistory,
): TombstoneProvenanceNode {
  return Object.freeze({
    state: 'tombstone',
    kind: 'tombstone',
    removal,
    secret: removal.secret,
    ...nodeHistory(history),
  });
}

export function createProvenanceTree(
  root?: ProvenanceNode,
  mode: StoredProvenanceMode = 'origin-only',
): ProvenanceTree {
  return Object.freeze({ mode, root });
}

/** Persistent child update used by merge to publish value/tree together. */
export function withProvenanceChild(
  container: ContainerProvenanceNode,
  segment: string,
  child: ProvenanceNode | undefined,
): ContainerProvenanceNode {
  const children = new Map(container.children);
  if (child === undefined) children.delete(segment);
  else children.set(segment, child);

  return createContainerProvenanceNode(
    container.kind,
    container.current,
    children,
    container.history,
  );
}

/** Exact segment lookup; a tombstone terminates traversal at its own path. */
export function getProvenanceNode(
  tree: ProvenanceTree,
  segments: readonly string[],
): ProvenanceNode | undefined {
  let node = tree.root;

  for (const segment of segments) {
    if (
      node === undefined ||
      node.state === 'tombstone' ||
      (node.kind === 'leaf' && node.removedChildren === undefined)
    ) {
      return undefined;
    }
    node =
      node.kind === 'leaf'
        ? node.removedChildren?.get(segment)
        : node.children.get(segment);
  }

  return node;
}

/** Finds the closest explicit removal on a missing path, if one exists. */
export function getNearestTombstone(
  tree: ProvenanceTree,
  segments: readonly string[],
): TombstoneProvenanceNode | undefined {
  let node = tree.root;
  if (node?.state === 'tombstone') return node;

  for (const segment of segments) {
    if (node === undefined) return undefined;
    node =
      node.kind === 'leaf'
        ? node.removedChildren?.get(segment)
        : node.children.get(segment);
    if (node?.state === 'tombstone') return node;
  }

  return undefined;
}
