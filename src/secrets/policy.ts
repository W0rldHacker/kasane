import { redactHistory } from '../provenance/history.js';
import { createOriginRecord } from '../provenance/origin.js';
import type { OriginRecord } from '../provenance/origin.js';
import type { LayerRegistry } from '../provenance/registry.js';
import {
  createContainerProvenanceNode,
  createLeafProvenanceNode,
  createProvenanceTree,
  createTombstoneProvenanceNode,
} from '../provenance/tree.js';
import type { ProvenanceNode, ProvenanceTree } from '../provenance/tree.js';
import type { SecretPathMatcher } from './matcher.js';

function appendPath(parent: string, segment: string): string {
  const escaped = segment.replaceAll('\\', '\\\\').replaceAll('.', '\\.');
  return parent === '' ? escaped : `${parent}.${escaped}`;
}

function markOriginSecret(
  registry: LayerRegistry,
  origin: OriginRecord,
): OriginRecord {
  if (origin.secret) return origin;

  const shared = {
    secret: true,
    ...(origin.inputReferenceId === undefined
      ? {}
      : { inputReferenceId: origin.inputReferenceId }),
    ...(origin.transformed === undefined
      ? {}
      : { transformed: origin.transformed }),
  };
  switch (origin.scope) {
    case 'leaf':
      return createOriginRecord(registry, origin.layerId, {
        ...shared,
        operation: origin.operation,
        scope: 'leaf',
      });
    case 'container':
      return createOriginRecord(registry, origin.layerId, {
        ...shared,
        operation: origin.operation,
        scope: 'container',
      });
    case 'tombstone':
      return createOriginRecord(registry, origin.layerId, {
        ...shared,
        operation: 'remove',
        scope: 'tombstone',
      });
  }
}

function applyNode(
  node: ProvenanceNode,
  path: string,
  registry: LayerRegistry,
  matcher: SecretPathMatcher,
): ProvenanceNode {
  const secret = matcher.matches(path);
  const history =
    secret && node.history !== undefined
      ? redactHistory(node.history)
      : node.history;

  if (node.state === 'tombstone') {
    return createTombstoneProvenanceNode(
      secret
        ? (markOriginSecret(registry, node.removal) as typeof node.removal)
        : node.removal,
      history,
    );
  }
  if (node.kind === 'leaf') {
    return createLeafProvenanceNode(
      secret
        ? (markOriginSecret(registry, node.current) as typeof node.current)
        : node.current,
      history,
    );
  }

  const children = new Map<string, ProvenanceNode>();
  for (const [segment, child] of node.children) {
    children.set(
      segment,
      applyNode(child, appendPath(path, segment), registry, matcher),
    );
  }
  return createContainerProvenanceNode(
    node.kind,
    secret
      ? (markOriginSecret(registry, node.current) as typeof node.current)
      : node.current,
    children,
    history,
  );
}

/** Final policy pass, reusable after validation provenance reconciliation. */
export function applySecretPathPolicy(
  tree: ProvenanceTree,
  registry: LayerRegistry,
  matcher: SecretPathMatcher,
): ProvenanceTree {
  return createProvenanceTree(
    tree.root === undefined
      ? undefined
      : applyNode(tree.root, '', registry, matcher),
    tree.mode,
  );
}
