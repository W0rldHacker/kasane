import { KasaneMergeError } from '../errors/index.js';
import type {
  ConfigNode,
  ConfigObject,
  ConfigPrimitive,
} from '../normalize/types.js';
import {
  appendHistoryEntry,
  createLeafHistoryEntry,
  createOperationHistoryEntry,
  redactHistory,
} from '../provenance/history.js';
import type { OriginHistory, ProvenanceMode } from '../provenance/history.js';
import {
  createOriginRecord,
  originBelongsToRegistry,
} from '../provenance/origin.js';
import type {
  LeafOperation,
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
  createTombstoneProvenanceNode,
} from '../provenance/tree.js';
import type {
  ContainerProvenanceNode,
  ProvenanceNode,
} from '../provenance/tree.js';
import type { MergeRuleIndex } from './rule-index.js';
import { isInSecretSubtree } from '../secrets/matcher.js';
import type { SecretPathMatcher } from '../secrets/matcher.js';
import { fingerprintSecretValue } from '../secrets/fingerprint.js';
import type { FingerprintKey } from '../secrets/fingerprint.js';
import { isRemoveMarker } from './remove.js';
import type { MergeLayerNode, MergeLayerObject } from './remove.js';
import { configNodeKind, resolveMergeDecision } from './strategy.js';

export interface MergeNodeContext {
  readonly fingerprintKey?: FingerprintKey;
  readonly inputReferenceId?: SourceReferenceId;
  readonly inputReferenceIds?: ReadonlyMap<string, SourceReferenceId>;
  readonly layerId: LayerId;
  readonly provenanceMode: ProvenanceMode;
  readonly registry: LayerRegistry;
  readonly rules: MergeRuleIndex;
  readonly secret: boolean;
  readonly secretPaths?: ReadonlySet<string>;
  readonly secretPolicy?: SecretPathMatcher;
}

export interface MergeNodeResult {
  readonly value: ConfigNode | undefined;
  readonly provenance: ProvenanceNode | undefined;
}

function failMerge(
  context: MergeNodeContext,
  path: string,
  kind: string,
): never {
  throw new KasaneMergeError('Configuration merge could not be completed.', {
    details: {
      path,
      layerId: context.layerId,
      kind,
      operation: 'merge',
    },
  });
}

function appendPath(parent: string, segment: string): string {
  let escaped = '';
  for (const character of segment) {
    if (character === '\\' || character === '.') escaped += '\\';
    escaped += character;
  }
  return parent === '' ? escaped : `${parent}.${escaped}`;
}

function defineConfigProperty(
  target: ConfigObject,
  key: string,
  value: ConfigNode,
): void {
  Object.defineProperty(target, key, {
    configurable: true,
    enumerable: true,
    value,
    writable: true,
  });
}

function provenanceEnabled(context: MergeNodeContext): boolean {
  return context.provenanceMode !== 'none';
}

function leafHistory(
  context: MergeNodeContext,
  previous: ProvenanceNode | undefined,
  origin: ReturnType<typeof createLeafOrigin>,
  value: ConfigPrimitive,
): OriginHistory | undefined {
  if (context.provenanceMode !== 'full') return undefined;

  const previousHistory =
    origin.secret && previous?.history !== undefined
      ? redactHistory(previous.history, (entryValue) =>
          fingerprintSecretValue(entryValue, context.fingerprintKey),
        )
      : previous?.history;
  return appendHistoryEntry(
    previousHistory,
    createLeafHistoryEntry(origin, value, (entryValue) =>
      fingerprintSecretValue(entryValue, context.fingerprintKey),
    ),
  );
}

function operationHistory(
  context: MergeNodeContext,
  previous: ProvenanceNode | undefined,
  origin:
    | ReturnType<typeof createStructuralOrigin>
    | ReturnType<typeof createRemovalOrigin>,
): OriginHistory | undefined {
  if (context.provenanceMode !== 'full') return undefined;

  const previousHistory =
    origin.secret && previous?.history !== undefined
      ? redactHistory(previous.history, (entryValue) =>
          fingerprintSecretValue(entryValue, context.fingerprintKey),
        )
      : previous?.history;
  return appendHistoryEntry(
    previousHistory,
    createOperationHistoryEntry(origin),
  );
}

function originReference(
  context: MergeNodeContext,
  path: string,
): Readonly<{ inputReferenceId?: SourceReferenceId }> {
  const pathReference = referenceForPath(context.inputReferenceIds, path);
  const inputReferenceId = pathReference ?? context.inputReferenceId;
  return inputReferenceId === undefined ? {} : { inputReferenceId };
}

function secretForPath(
  context: MergeNodeContext,
  path: string,
  annotationPath = path,
): boolean {
  return (
    context.secret ||
    isInSecretSubtree(context.secretPaths, annotationPath) ||
    context.secretPolicy?.matches(path) === true
  );
}

function referenceForPath(
  references: ReadonlyMap<string, SourceReferenceId> | undefined,
  path: string,
): SourceReferenceId | undefined {
  if (references === undefined) return undefined;

  let candidate = path;
  while (candidate.length > 0) {
    const reference = references.get(candidate);
    if (reference !== undefined) return reference;

    let separator = -1;
    for (let index = candidate.length - 1; index >= 0; index -= 1) {
      if (candidate[index] !== '.') continue;

      let escapes = 0;
      for (let escape = index - 1; escape >= 0; escape -= 1) {
        if (candidate[escape] !== '\\') break;
        escapes += 1;
      }
      if (escapes % 2 === 0) {
        separator = index;
        break;
      }
    }
    candidate = separator === -1 ? '' : candidate.slice(0, separator);
  }
  return references.get('');
}

function createLeafOrigin(
  context: MergeNodeContext,
  path: string,
  operation: LeafOperation,
  annotationPath = path,
) {
  return createOriginRecord(context.registry, context.layerId, {
    operation,
    scope: 'leaf',
    secret: secretForPath(context, path, annotationPath),
    ...originReference(context, path),
  });
}

function createStructuralOrigin(
  context: MergeNodeContext,
  path: string,
  operation: StructuralOperation,
  annotationPath = path,
) {
  return createOriginRecord(context.registry, context.layerId, {
    operation,
    scope: 'container',
    secret: secretForPath(context, path, annotationPath),
    ...originReference(context, path),
  });
}

function createRemovalOrigin(
  context: MergeNodeContext,
  path: string,
  secret: boolean,
) {
  return createOriginRecord(context.registry, context.layerId, {
    operation: 'remove',
    scope: 'tombstone',
    secret,
    ...originReference(context, path),
  });
}

function requireExistingProvenance(
  value: ConfigNode,
  provenance: ProvenanceNode | undefined,
  path: string,
  context: MergeNodeContext,
): ProvenanceNode {
  if (provenance === undefined || provenance.state === 'tombstone') {
    return failMerge(context, path, 'inconsistent-base-provenance');
  }

  if (!originBelongsToRegistry(context.registry, provenance.current)) {
    return failMerge(context, path, 'foreign-base-provenance');
  }

  const kind = configNodeKind(value);
  if (
    (kind === 'array' && provenance.kind !== 'array') ||
    (kind === 'object' && provenance.kind !== 'object') ||
    (kind !== 'array' && kind !== 'object' && provenance.kind !== 'leaf')
  ) {
    return failMerge(context, path, 'inconsistent-base-provenance');
  }
  return provenance;
}

function cloneExistingSubtree(
  value: ConfigNode,
  provenance: ProvenanceNode | undefined,
  path: string,
  context: MergeNodeContext,
): MergeNodeResult {
  const currentProvenance = provenanceEnabled(context)
    ? requireExistingProvenance(value, provenance, path, context)
    : undefined;

  if (value === null || typeof value !== 'object') {
    return { value, provenance: currentProvenance };
  }

  if (Array.isArray(value)) {
    const output: ConfigNode[] = [];
    const container = currentProvenance as ContainerProvenanceNode | undefined;

    for (let index = 0; index < value.length; index += 1) {
      const child = cloneExistingSubtree(
        value[index] as ConfigNode,
        container?.children.get(String(index)),
        appendPath(path, String(index)),
        context,
      );
      output.push(child.value as ConfigNode);
    }

    return { value: output, provenance: currentProvenance };
  }

  const output: ConfigObject = {};
  const container = currentProvenance as ContainerProvenanceNode | undefined;
  for (const key of Object.keys(value)) {
    const child = cloneExistingSubtree(
      value[key] as ConfigNode,
      container?.children.get(key),
      appendPath(path, key),
      context,
    );
    defineConfigProperty(output, key, child.value as ConfigNode);
  }
  return { value: output, provenance: currentProvenance };
}

function cloneIncomingSubtree(
  value: MergeLayerNode,
  operation: 'set' | 'replace',
  path: string,
  context: MergeNodeContext,
  insideArray = false,
  previous?: ProvenanceNode,
  annotationPath = path,
): MergeNodeResult {
  if (isRemoveMarker(value)) {
    return insideArray
      ? failMerge(context, path, 'remove-in-array')
      : removeNode(undefined, undefined, path, context);
  }

  if (value === null || typeof value !== 'object') {
    const origin = provenanceEnabled(context)
      ? createLeafOrigin(context, path, operation, annotationPath)
      : undefined;
    return {
      value,
      provenance:
        origin === undefined
          ? undefined
          : createLeafProvenanceNode(
              origin,
              leafHistory(context, previous, origin, value),
            ),
    };
  }

  if (Array.isArray(value)) {
    const output: ConfigNode[] = [];
    const children = new Map<string, ProvenanceNode>();

    for (let index = 0; index < value.length; index += 1) {
      const child = cloneIncomingSubtree(
        value[index] as ConfigNode,
        operation,
        appendPath(path, String(index)),
        context,
        true,
        undefined,
        appendPath(annotationPath, String(index)),
      );
      output.push(child.value as ConfigNode);
      if (child.provenance !== undefined) {
        children.set(String(index), child.provenance);
      }
    }

    const origin = provenanceEnabled(context)
      ? createStructuralOrigin(context, path, operation, annotationPath)
      : undefined;
    return {
      value: output,
      provenance:
        origin === undefined
          ? undefined
          : createContainerProvenanceNode(
              'array',
              origin,
              children,
              operationHistory(context, previous, origin),
            ),
    };
  }

  const output: ConfigObject = {};
  const children = new Map<string, ProvenanceNode>();
  for (const key of Object.keys(value)) {
    const childValue = value[key];
    if (childValue === undefined) continue;

    const child = cloneIncomingSubtree(
      childValue,
      operation,
      appendPath(path, key),
      context,
      insideArray,
      undefined,
      appendPath(annotationPath, key),
    );
    if (child.value !== undefined) {
      defineConfigProperty(output, key, child.value);
    }
    if (child.provenance !== undefined) children.set(key, child.provenance);
  }

  const origin = provenanceEnabled(context)
    ? createStructuralOrigin(context, path, operation, annotationPath)
    : undefined;
  return {
    value: output,
    provenance:
      origin === undefined
        ? undefined
        : createContainerProvenanceNode(
            'object',
            origin,
            children,
            operationHistory(context, previous, origin),
          ),
  };
}

function requireArrayProvenance(
  base: ConfigNode[],
  provenance: ProvenanceNode | undefined,
  path: string,
  context: MergeNodeContext,
): ContainerProvenanceNode | undefined {
  if (!provenanceEnabled(context)) return undefined;
  const existing = requireExistingProvenance(base, provenance, path, context);
  if (existing.kind !== 'array') {
    return failMerge(context, path, 'inconsistent-base-provenance');
  }
  return existing;
}

function combineArrays(
  base: ConfigNode[],
  baseProvenance: ProvenanceNode | undefined,
  layer: ConfigNode[],
  operation: 'append' | 'prepend',
  path: string,
  context: MergeNodeContext,
): MergeNodeResult {
  const existingContainer = requireArrayProvenance(
    base,
    baseProvenance,
    path,
    context,
  );
  const output: ConfigNode[] = [];
  const children = new Map<string, ProvenanceNode>();

  const appendIncoming = (): void => {
    for (let layerIndex = 0; layerIndex < layer.length; layerIndex += 1) {
      const item = layer[layerIndex] as ConfigNode;
      const outputIndex = output.length;
      const child = cloneIncomingSubtree(
        item,
        'set',
        appendPath(path, String(outputIndex)),
        context,
        true,
        undefined,
        appendPath(path, String(layerIndex)),
      );
      output.push(child.value as ConfigNode);
      if (child.provenance !== undefined) {
        children.set(String(outputIndex), child.provenance);
      }
    }
  };

  const appendExisting = (): void => {
    for (let index = 0; index < base.length; index += 1) {
      const outputIndex = output.length;
      const child = cloneExistingSubtree(
        base[index] as ConfigNode,
        existingContainer?.children.get(String(index)),
        appendPath(path, String(outputIndex)),
        context,
      );
      output.push(child.value as ConfigNode);
      if (child.provenance !== undefined) {
        children.set(String(outputIndex), child.provenance);
      }
    }
  };

  if (operation === 'append') {
    appendExisting();
    appendIncoming();
  } else {
    appendIncoming();
    appendExisting();
  }

  const origin = provenanceEnabled(context)
    ? createStructuralOrigin(context, path, operation)
    : undefined;
  return {
    value: output,
    provenance:
      origin === undefined
        ? undefined
        : createContainerProvenanceNode(
            'array',
            origin,
            children,
            operationHistory(context, baseProvenance, origin),
          ),
  };
}

function removeNode(
  base: ConfigNode | undefined,
  baseProvenance: ProvenanceNode | undefined,
  path: string,
  context: MergeNodeContext,
): MergeNodeResult {
  let secret = secretForPath(context, path);

  if (provenanceEnabled(context) && base !== undefined) {
    const existing = requireExistingProvenance(
      base,
      baseProvenance,
      path,
      context,
    );
    secret ||= subtreeIsSecret(existing);
  } else if (
    provenanceEnabled(context) &&
    baseProvenance?.state === 'tombstone'
  ) {
    if (!originBelongsToRegistry(context.registry, baseProvenance.removal)) {
      return failMerge(context, path, 'foreign-base-provenance');
    }
    secret ||= baseProvenance.secret;
  }

  const origin = provenanceEnabled(context)
    ? createRemovalOrigin(context, path, secret)
    : undefined;
  return {
    value: undefined,
    provenance:
      origin === undefined
        ? undefined
        : createTombstoneProvenanceNode(
            origin,
            operationHistory(context, baseProvenance, origin),
          ),
  };
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

function requireObjectProvenance(
  base: ConfigObject,
  provenance: ProvenanceNode | undefined,
  path: string,
  context: MergeNodeContext,
): ContainerProvenanceNode | undefined {
  if (!provenanceEnabled(context)) return undefined;
  const existing = requireExistingProvenance(base, provenance, path, context);
  if (existing.kind !== 'object') {
    return failMerge(context, path, 'inconsistent-base-provenance');
  }
  return existing;
}

function mergeObjects(
  base: ConfigObject,
  baseProvenance: ProvenanceNode | undefined,
  layer: MergeLayerObject,
  path: string,
  context: MergeNodeContext,
): MergeNodeResult {
  const existingContainer = requireObjectProvenance(
    base,
    baseProvenance,
    path,
    context,
  );
  const output: ConfigObject = {};
  const children = new Map<string, ProvenanceNode>();
  const baseKeys = Object.keys(base);
  const layerKeys = Object.keys(layer);

  for (const key of baseKeys) {
    const childPath = appendPath(path, key);
    const child = Object.prototype.hasOwnProperty.call(layer, key)
      ? mergeNode(
          base[key],
          existingContainer?.children.get(key),
          layer[key],
          childPath,
          context,
        )
      : cloneExistingSubtree(
          base[key] as ConfigNode,
          existingContainer?.children.get(key),
          childPath,
          context,
        );

    if (child.value !== undefined) {
      defineConfigProperty(output, key, child.value);
    }
    if (child.provenance !== undefined) children.set(key, child.provenance);
  }

  for (const key of layerKeys) {
    if (Object.prototype.hasOwnProperty.call(base, key)) continue;

    const child = mergeNode(
      undefined,
      existingContainer?.children.get(key),
      layer[key],
      appendPath(path, key),
      context,
    );
    if (child.value !== undefined) {
      defineConfigProperty(output, key, child.value);
    }
    if (child.provenance !== undefined) children.set(key, child.provenance);
  }

  if (existingContainer !== undefined) {
    for (const [key, child] of existingContainer.children) {
      if (
        child.state === 'tombstone' &&
        !Object.prototype.hasOwnProperty.call(base, key) &&
        !Object.prototype.hasOwnProperty.call(layer, key)
      ) {
        children.set(key, child);
      }
    }
  }

  const origin = provenanceEnabled(context)
    ? createStructuralOrigin(context, path, 'merge')
    : undefined;
  return {
    value: output,
    provenance:
      origin === undefined
        ? undefined
        : createContainerProvenanceNode(
            'object',
            origin,
            children,
            operationHistory(context, baseProvenance, origin),
          ),
  };
}

/** Merges one path and constructs the matching provenance node in one branch. */
export function mergeNode(
  base: ConfigNode | undefined,
  baseProvenance: ProvenanceNode | undefined,
  layer: MergeLayerNode | undefined,
  path: string,
  context: MergeNodeContext,
): MergeNodeResult {
  if (layer === undefined) {
    return base === undefined
      ? { value: undefined, provenance: baseProvenance }
      : cloneExistingSubtree(base, baseProvenance, path, context);
  }

  if (isRemoveMarker(layer)) {
    return removeNode(base, baseProvenance, path, context);
  }

  const decision = resolveMergeDecision(
    base === undefined ? 'absent' : configNodeKind(base),
    configNodeKind(layer as ConfigNode),
    context.rules.get(path),
  );

  if (decision.outcome === 'error') {
    return failMerge(context, path, decision.reason);
  }

  switch (decision.outcome) {
    case 'set':
      return cloneIncomingSubtree(
        layer,
        'set',
        path,
        context,
        false,
        baseProvenance,
      );
    case 'replace':
      return cloneIncomingSubtree(
        layer,
        'replace',
        path,
        context,
        false,
        baseProvenance,
      );
    case 'merge':
      return mergeObjects(
        base as ConfigObject,
        baseProvenance,
        layer as MergeLayerObject,
        path,
        context,
      );
    case 'append':
      return combineArrays(
        base as ConfigNode[],
        baseProvenance,
        layer as ConfigNode[],
        'append',
        path,
        context,
      );
    case 'prepend':
      return combineArrays(
        base as ConfigNode[],
        baseProvenance,
        layer as ConfigNode[],
        'prepend',
        path,
        context,
      );
    case 'no-op':
      return failMerge(context, path, 'invalid-merge-outcome');
    case 'remove':
      return removeNode(base, baseProvenance, path, context);
  }
}
