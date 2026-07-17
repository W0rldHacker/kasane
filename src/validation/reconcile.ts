import { KasaneValidationError } from '../errors/index.js';
import type { ConfigNode, ConfigPrimitive } from '../normalize/types.js';
import {
  appendHistoryEntry,
  createLeafHistoryEntry,
  createOperationHistoryEntry,
  redactHistory,
} from '../provenance/history.js';
import type { OriginHistory } from '../provenance/history.js';
import type { StoredProvenanceMode } from '../provenance/history.js';
import { createOriginRecord } from '../provenance/origin.js';
import type {
  LeafOperation,
  LeafOriginRecord,
  OriginRecord,
  StructuralOriginRecord,
  StructuralOperation,
} from '../provenance/origin.js';
import type {
  LayerId,
  LayerRegistry,
  SourceReferenceId,
} from '../provenance/registry.js';
import {
  createContainerProvenanceNode,
  createLeafProvenanceNode,
  createProvenanceTree,
  createTombstoneProvenanceNode,
} from '../provenance/tree.js';
import type {
  ContainerKind,
  ContainerProvenanceNode,
  ProvenanceNode,
  ProvenanceTree,
} from '../provenance/tree.js';
import { fingerprintSecretValue } from '../secrets/fingerprint.js';
import type { FingerprintKey } from '../secrets/fingerprint.js';

type ValueKind = ContainerKind | 'leaf';

interface ReconcileContext {
  readonly fingerprintKey?: FingerprintKey;
  readonly mode: StoredProvenanceMode;
  readonly registry: LayerRegistry;
  readonly validationLayerId: LayerId;
}

export interface ReconcileValidationInput {
  readonly after: ConfigNode | undefined;
  readonly before: ConfigNode | undefined;
  readonly fingerprintKey?: FingerprintKey;
  readonly provenance: ProvenanceTree;
  readonly registry: LayerRegistry;
  readonly validationLayerId: LayerId;
}

function failReconciliation(kind: string): never {
  throw new KasaneValidationError(
    'Validation provenance reconciliation failed.',
    { details: { kind, operation: 'reconcile-validation' } },
  );
}

function valueKind(value: ConfigNode): ValueKind {
  if (typeof value !== 'object' || value === null) return 'leaf';
  return Array.isArray(value) ? 'array' : 'object';
}

function configNodesEqual(left: ConfigNode, right: ConfigNode): boolean {
  if (left === right) return true;
  if (
    typeof left !== 'object' ||
    left === null ||
    typeof right !== 'object' ||
    right === null
  ) {
    return false;
  }

  const leftArray = Array.isArray(left);
  if (leftArray !== Array.isArray(right)) return false;
  if (leftArray) {
    const rightArray = right as ConfigNode[];
    if (left.length !== rightArray.length) return false;
    return left.every((value, index) =>
      configNodesEqual(value, rightArray[index] as ConfigNode),
    );
  }

  const leftKeys = Object.keys(left);
  const rightObject = right as Record<string, ConfigNode>;
  if (leftKeys.length !== Object.keys(rightObject).length) return false;
  return leftKeys.every(
    (key) =>
      Object.prototype.hasOwnProperty.call(rightObject, key) &&
      configNodesEqual(left[key] as ConfigNode, rightObject[key] as ConfigNode),
  );
}

function commonOrigin(
  origin: LeafOriginRecord | StructuralOriginRecord,
): Readonly<{
  inputReferenceId?: SourceReferenceId;
  secret: boolean;
  transformed: true;
}> {
  return {
    secret: origin.secret,
    transformed: true,
    ...(origin.inputReferenceId === undefined
      ? {}
      : { inputReferenceId: origin.inputReferenceId }),
  };
}

function transformedOrigin(
  context: ReconcileContext,
  previous: LeafOriginRecord | StructuralOriginRecord,
  kind: ValueKind,
): OriginRecord {
  const common = commonOrigin(previous);
  if (kind === 'leaf') {
    const operation: LeafOperation =
      previous.operation === 'set' || previous.operation === 'replace'
        ? previous.operation
        : 'replace';
    return createOriginRecord(context.registry, previous.layerId, {
      ...common,
      operation,
      scope: 'leaf',
    });
  }

  const operation: StructuralOperation = previous.operation;
  return createOriginRecord(context.registry, previous.layerId, {
    ...common,
    operation,
    scope: 'container',
  });
}

function validationLeafOrigin(
  context: ReconcileContext,
  operation: LeafOperation,
  secret: boolean,
) {
  return createOriginRecord(context.registry, context.validationLayerId, {
    operation,
    scope: 'leaf',
    secret,
  });
}

function validationContainerOrigin(
  context: ReconcileContext,
  operation: StructuralOperation,
  secret: boolean,
) {
  return createOriginRecord(context.registry, context.validationLayerId, {
    operation,
    scope: 'container',
    secret,
  });
}

function validationRemovalOrigin(context: ReconcileContext, secret: boolean) {
  return createOriginRecord(context.registry, context.validationLayerId, {
    operation: 'remove',
    scope: 'tombstone',
    secret,
  });
}

function leafHistory(
  context: ReconcileContext,
  previous: OriginHistory | undefined,
  value: ConfigPrimitive,
  operation: LeafOperation,
  secret: boolean,
): OriginHistory | undefined {
  if (context.mode !== 'full') return undefined;
  const origin = validationLeafOrigin(context, operation, secret);
  return appendHistoryEntry(
    previous,
    createLeafHistoryEntry(origin, value, (entryValue) =>
      fingerprintSecretValue(entryValue, context.fingerprintKey),
    ),
  );
}

function containerHistory(
  context: ReconcileContext,
  previous: OriginHistory | undefined,
  operation: StructuralOperation,
  secret: boolean,
): OriginHistory | undefined {
  if (context.mode !== 'full') return undefined;
  return appendHistoryEntry(
    previous,
    createOperationHistoryEntry(
      validationContainerOrigin(context, operation, secret),
    ),
  );
}

function removalHistory(
  context: ReconcileContext,
  previous: OriginHistory | undefined,
  secret: boolean,
): OriginHistory | undefined {
  if (context.mode !== 'full') return undefined;
  const safePrevious =
    secret && previous !== undefined
      ? redactHistory(previous, (entryValue) =>
          fingerprintSecretValue(entryValue, context.fingerprintKey),
        )
      : previous;
  return appendHistoryEntry(
    safePrevious,
    createOperationHistoryEntry(validationRemovalOrigin(context, secret)),
  );
}

function subtreeIsSecret(node: ProvenanceNode): boolean {
  if (node.secret) return true;
  if (node.state === 'tombstone') return false;
  const descendants =
    node.kind === 'leaf'
      ? node.removedChildren?.values()
      : node.children.values();
  for (const child of descendants ?? []) {
    if (subtreeIsSecret(child)) return true;
  }
  return false;
}

function requireValueNode(
  value: ConfigNode,
  provenance: ProvenanceNode | undefined,
): Exclude<ProvenanceNode, { state: 'tombstone' }> {
  if (provenance === undefined || provenance.state === 'tombstone') {
    return failReconciliation('missing-input-provenance');
  }
  if (provenance.kind !== valueKind(value)) {
    return failReconciliation('inconsistent-input-provenance');
  }
  return provenance;
}

function childValues(value: ConfigNode): ReadonlyMap<string, ConfigNode> {
  if (typeof value !== 'object' || value === null) return new Map();
  if (Array.isArray(value)) {
    return new Map(value.map((child, index) => [String(index), child]));
  }
  return new Map(
    Object.keys(value).map((key) => [key, value[key] as ConfigNode]),
  );
}

function addSubtree(
  value: ConfigNode,
  context: ReconcileContext,
  secret: boolean,
  previous?: ProvenanceNode,
): ProvenanceNode {
  const kind = valueKind(value);
  if (kind === 'leaf') {
    const origin = validationLeafOrigin(context, 'set', secret);
    return createLeafProvenanceNode(
      origin,
      leafHistory(
        context,
        previous?.history,
        value as ConfigPrimitive,
        'set',
        secret,
      ),
    );
  }

  const children = new Map<string, ProvenanceNode>();
  for (const [segment, child] of childValues(value)) {
    children.set(segment, addSubtree(child, context, secret));
  }
  const origin = validationContainerOrigin(context, 'set', secret);
  return createContainerProvenanceNode(
    kind,
    origin,
    children,
    containerHistory(context, previous?.history, 'set', secret),
  );
}

function removePath(
  previous: ProvenanceNode,
  context: ReconcileContext,
  inheritedSecret: boolean,
): ProvenanceNode {
  const secret = inheritedSecret || subtreeIsSecret(previous);
  const origin = validationRemovalOrigin(context, secret);
  return createTombstoneProvenanceNode(
    origin,
    removalHistory(context, previous.history, secret),
  );
}

function reconciledChildren(
  before: ConfigNode,
  previous: ContainerProvenanceNode,
  after: ConfigNode,
  context: ReconcileContext,
  inheritedSecret: boolean,
): ReadonlyMap<string, ProvenanceNode> {
  const beforeChildren = childValues(before);
  const afterChildren = childValues(after);
  const segments = new Set([
    ...beforeChildren.keys(),
    ...afterChildren.keys(),
    ...previous.children.keys(),
  ]);
  const children = new Map<string, ProvenanceNode>();

  for (const segment of segments) {
    const beforeChild = beforeChildren.get(segment);
    const afterChild = afterChildren.get(segment);
    const previousChild = previous.children.get(segment);

    if (beforeChild !== undefined && afterChild !== undefined) {
      children.set(
        segment,
        reconcileNode(
          beforeChild,
          previousChild,
          afterChild,
          context,
          inheritedSecret,
        ),
      );
    } else if (afterChild !== undefined) {
      children.set(
        segment,
        addSubtree(afterChild, context, inheritedSecret, previousChild),
      );
    } else if (beforeChild !== undefined) {
      children.set(
        segment,
        removePath(
          requireValueNode(beforeChild, previousChild),
          context,
          inheritedSecret,
        ),
      );
    } else if (previousChild?.state === 'tombstone') {
      children.set(segment, previousChild);
    }
  }
  return children;
}

function changedKindNode(
  before: ConfigNode,
  previous: Exclude<ProvenanceNode, { state: 'tombstone' }>,
  after: ConfigNode,
  context: ReconcileContext,
): ProvenanceNode {
  const afterKind = valueKind(after);
  const current = transformedOrigin(context, previous.current, afterKind);
  const secret = previous.secret;
  if (afterKind === 'leaf') {
    const removedChildren = new Map<string, ProvenanceNode>();
    if (previous.kind !== 'leaf') {
      const beforeChildren = childValues(before);
      const segments = new Set([
        ...beforeChildren.keys(),
        ...previous.children.keys(),
      ]);
      for (const segment of segments) {
        const child = beforeChildren.get(segment);
        const previousChild = previous.children.get(segment);
        if (child !== undefined) {
          removedChildren.set(
            segment,
            removePath(requireValueNode(child, previousChild), context, secret),
          );
        } else if (previousChild?.state === 'tombstone') {
          removedChildren.set(segment, previousChild);
        }
      }
    }
    return createLeafProvenanceNode(
      current as ReturnType<typeof validationLeafOrigin>,
      leafHistory(
        context,
        previous.history,
        after as ConfigPrimitive,
        'replace',
        secret,
      ),
      removedChildren,
    );
  }

  const children = new Map<string, ProvenanceNode>();
  const afterChildren = childValues(after);
  for (const [segment, child] of afterChildren) {
    children.set(segment, addSubtree(child, context, secret));
  }

  if (previous.kind === 'leaf') {
    for (const [segment, child] of previous.removedChildren ?? []) {
      if (!afterChildren.has(segment)) children.set(segment, child);
    }
  }

  if (previous.kind !== 'leaf') {
    for (const [segment, child] of childValues(before)) {
      if (afterChildren.has(segment)) continue;
      children.set(
        segment,
        removePath(
          requireValueNode(child, previous.children.get(segment)),
          context,
          secret,
        ),
      );
    }
  }

  return createContainerProvenanceNode(
    afterKind,
    current as ReturnType<typeof validationContainerOrigin>,
    children,
    containerHistory(context, previous.history, 'replace', secret),
  );
}

function reconcileNode(
  before: ConfigNode,
  previousNode: ProvenanceNode | undefined,
  after: ConfigNode,
  context: ReconcileContext,
  inheritedSecret: boolean,
): ProvenanceNode {
  const previous = requireValueNode(before, previousNode);
  if (configNodesEqual(before, after)) return previous;

  const beforeKind = valueKind(before);
  const afterKind = valueKind(after);
  if (beforeKind !== afterKind) {
    return changedKindNode(before, previous, after, context);
  }

  const current = transformedOrigin(context, previous.current, afterKind);
  const secret = previous.secret || inheritedSecret;
  if (afterKind === 'leaf') {
    const removedChildren =
      previous.kind === 'leaf' ? previous.removedChildren : undefined;
    return createLeafProvenanceNode(
      current as ReturnType<typeof validationLeafOrigin>,
      leafHistory(
        context,
        previous.history,
        after as ConfigPrimitive,
        'replace',
        secret,
      ),
      removedChildren,
    );
  }

  const container = previous as ContainerProvenanceNode;
  return createContainerProvenanceNode(
    afterKind,
    current as ReturnType<typeof validationContainerOrigin>,
    reconciledChildren(before, container, after, context, container.secret),
    containerHistory(context, previous.history, 'replace', secret),
  );
}

/** Reconciles normalized validator output with the pre-validation tree. */
export function reconcileValidationProvenance(
  input: ReconcileValidationInput,
): ProvenanceTree {
  const context: ReconcileContext = {
    mode: input.provenance.mode,
    registry: input.registry,
    validationLayerId: input.validationLayerId,
    ...(input.fingerprintKey === undefined
      ? {}
      : { fingerprintKey: input.fingerprintKey }),
  };

  let root: ProvenanceNode | undefined;
  if (input.before === undefined && input.after === undefined) {
    root = input.provenance.root;
  } else if (input.before === undefined) {
    root = addSubtree(
      input.after as ConfigNode,
      context,
      false,
      input.provenance.root,
    );
  } else if (input.after === undefined) {
    root = removePath(
      requireValueNode(input.before, input.provenance.root),
      context,
      false,
    );
  } else {
    root = reconcileNode(
      input.before,
      input.provenance.root,
      input.after,
      context,
      false,
    );
  }

  return createProvenanceTree(root, input.provenance.mode);
}
