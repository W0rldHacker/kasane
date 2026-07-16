import type { ConfigNode } from '../normalize/types.js';

function defineConfigProperty(
  target: Record<string, ConfigNode>,
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

/** Clones a canonical tree without retaining an input container reference. */
export function cloneConfigNode<T extends ConfigNode>(value: T): T {
  if (typeof value !== 'object' || value === null) return value;

  if (Array.isArray(value)) {
    return value.map((item) => cloneConfigNode(item)) as T;
  }

  const output: Record<string, ConfigNode> = {};
  for (const key of Object.keys(value)) {
    defineConfigProperty(
      output,
      key,
      cloneConfigNode(value[key] as ConfigNode),
    );
  }
  return output as T;
}

/** Freezes every container in a canonical tree, including the root. */
export function deepFreezeConfigNode<T extends ConfigNode>(value: T): T {
  if (typeof value !== 'object' || value === null) return value;

  const work: object[] = [value];
  while (work.length > 0) {
    const current = work.pop();
    if (current === undefined || Object.isFrozen(current)) continue;

    for (const child of Object.values(current) as ConfigNode[]) {
      if (typeof child === 'object' && child !== null) work.push(child);
    }
    Object.freeze(current);
  }
  return value;
}
