import { KasaneLayerError } from '../errors/index.js';
import type { LayerSource } from '../sources/index.js';
import type { LayerDescriptor } from './types.js';

export type SecretLoader<Output = unknown> = () => Output | Promise<Output>;

export interface SecretLayerOptions {
  readonly enabled?: boolean;
}

function failSecretDeclaration(kind: string): never {
  throw new KasaneLayerError('Secret layer declaration is invalid.', {
    details: { kind, operation: 'create-secret-layer' },
  });
}

/** Creates a value/loader source whose incoming descendants are all secret. */
export function secret<Output = unknown>(
  name: string,
  input: Output | SecretLoader<Output>,
  options?: SecretLayerOptions,
): LayerDescriptor;
export function secret(
  name: string,
  input: unknown,
  options: unknown = {},
): LayerDescriptor {
  if (
    typeof options !== 'object' ||
    options === null ||
    Array.isArray(options)
  ) {
    return failSecretDeclaration('invalid-secret-options');
  }
  const enabled = (options as Record<string, unknown>)['enabled'];
  if (enabled !== undefined && typeof enabled !== 'boolean') {
    return failSecretDeclaration('invalid-secret-enabled');
  }

  const source: LayerSource = Object.freeze({
    kind: 'secret',
    load(): unknown {
      return typeof input === 'function' ? (input as SecretLoader)() : input;
    },
  });
  return Object.freeze({
    name,
    secret: true,
    source,
    ...(enabled === undefined ? {} : { enabled }),
  });
}
