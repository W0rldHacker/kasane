import type { LayerDescriptor } from './types.js';
import type { LayerSource } from '../sources/index.js';

export interface ValueLayerOptions {
  readonly enabled?: boolean;
}

/** Creates a synchronous in-memory source without reading or mutating its data. */
export function value(
  name: string,
  data: unknown,
  options: ValueLayerOptions = {},
): LayerDescriptor {
  const source: LayerSource = Object.freeze({
    kind: 'value',
    load(): unknown {
      return data;
    },
  });

  return Object.freeze({
    name,
    source,
    ...(options.enabled === undefined ? {} : { enabled: options.enabled }),
  });
}
