import process from 'node:process';

import { KasaneLayerError } from '../errors/index.js';
import { sourceMetadata } from '../sources/index.js';
import type {
  SourceContext,
  SourceMetadata,
  SourceWithMetadata,
} from '../sources/index.js';
import {
  mapEnvSource,
  prepareExplicitMap,
  type EnvCase,
  type EnvCoercion,
  type EnvMap,
  type EnvSource,
} from './env-map.js';
import type { LayerDescriptor } from './types.js';

export type { EnvMap, EnvMapEntry, EnvParser, EnvSource } from './env-map.js';

export interface EnvLayerOptions {
  readonly case?: EnvCase;
  readonly coerce?: EnvCoercion;
  readonly enabled?: boolean;
  readonly map?: EnvMap;
  readonly prefix?: string;
  readonly separator?: string;
  readonly secret?: boolean;
  readonly source?: EnvSource;
}

const EMPTY_METADATA: SourceMetadata = Object.freeze({});

function failLayer(kind: string): never {
  throw new KasaneLayerError('Environment layer declaration is invalid.', {
    details: { kind, operation: 'create-env-layer' },
  });
}

function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Creates a deterministic environment-variable source. */
export function env(name: string, options?: EnvLayerOptions): LayerDescriptor;
export function env(name: string, options: unknown = {}): LayerDescriptor {
  if (!isObject(options)) return failLayer('invalid-env-options');
  const input = options as Record<string, unknown>;
  const enabled = input['enabled'];
  const prefix = input['prefix'];
  const separator = input['separator'];
  const casing = input['case'];
  const coerce = input['coerce'];
  const configuredSource = input['source'];
  const secretLayer = input['secret'];

  if (enabled !== undefined && typeof enabled !== 'boolean') {
    return failLayer('invalid-env-enabled');
  }
  if (prefix !== undefined && typeof prefix !== 'string') {
    return failLayer('invalid-env-prefix');
  }
  if (
    separator !== undefined &&
    (typeof separator !== 'string' || separator.length === 0)
  ) {
    return failLayer('invalid-env-separator');
  }
  if (casing !== undefined && casing !== 'lower' && casing !== 'preserve') {
    return failLayer('invalid-env-case');
  }
  if (coerce !== undefined && coerce !== false && coerce !== 'json') {
    return failLayer('invalid-env-coercion');
  }
  if (configuredSource !== undefined && !isObject(configuredSource)) {
    return failLayer('invalid-env-source');
  }
  if (secretLayer !== undefined && typeof secretLayer !== 'boolean') {
    return failLayer('invalid-env-secret');
  }

  const explicitMap = prepareExplicitMap(input['map']);
  const prepared = Object.freeze({
    casing: casing ?? 'lower',
    coerce: coerce ?? false,
    ...(explicitMap === undefined ? {} : { explicitMap }),
    prefix: prefix ?? '',
    separator: separator ?? '__',
  });
  const metadataByContext = new WeakMap<SourceContext, SourceMetadata>();
  const source: SourceWithMetadata = Object.freeze({
    kind: 'env',
    [sourceMetadata](context: SourceContext): SourceMetadata {
      return metadataByContext.get(context) ?? EMPTY_METADATA;
    },
    async load(context: SourceContext): Promise<unknown> {
      const result = await mapEnvSource(
        (configuredSource as EnvSource | undefined) ?? process.env,
        prepared,
      );
      metadataByContext.set(context, result.metadata);
      return result.value;
    },
  });

  return Object.freeze({
    name,
    source,
    ...(enabled === undefined ? {} : { enabled }),
    ...(secretLayer === undefined ? {} : { secret: secretLayer }),
  });
}
