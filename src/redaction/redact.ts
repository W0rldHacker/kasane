import type { ConfigNode } from '../normalize/types.js';
import type { ProvenanceNode, ProvenanceTree } from '../provenance/tree.js';

export const REDACTED_VALUE = '[REDACTED]';

function redactNode(
  value: ConfigNode,
  provenance: ProvenanceNode | undefined,
  inheritedSecret: boolean,
): ConfigNode {
  const secret = provenance?.secret ?? inheritedSecret;

  if (typeof value !== 'object' || value === null) {
    return secret ? REDACTED_VALUE : value;
  }

  if (provenance?.state === 'tombstone') return REDACTED_VALUE;
  const children =
    provenance?.state === 'value' && provenance.kind !== 'leaf'
      ? provenance.children
      : undefined;

  if (Array.isArray(value)) {
    return value.map((child, index) =>
      redactNode(child, children?.get(String(index)), secret),
    );
  }

  const output: Record<string, ConfigNode> = {};
  for (const key of Object.keys(value)) {
    Object.defineProperty(output, key, {
      configurable: true,
      enumerable: true,
      value: redactNode(value[key] as ConfigNode, children?.get(key), secret),
      writable: true,
    });
  }
  return output;
}

/** Central structural hook used by snapshot JSON serialization. */
export function redactSnapshotValue(
  value: ConfigNode,
  provenance: ProvenanceTree | undefined,
): ConfigNode {
  return redactNode(value, provenance?.root, false);
}
