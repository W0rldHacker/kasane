import type {
  LayerDescriptor,
  LayerSource,
  SourceContext,
} from '@worldhacker/kasane';

export interface ProviderLoadOptions {
  readonly signal?: AbortSignal;
}

export interface ProviderClient {
  readonly load: (resource: string, options: ProviderLoadOptions) => unknown;
}

export interface CompanionProviderOptions {
  readonly client: ProviderClient;
  /** A non-secret provider identifier safe for diagnostics and support. */
  readonly resource: string;
  /** Marks every value returned by this provider layer as secret. */
  readonly secret?: boolean;
}

export interface CompanionProviderReference {
  readonly provider: 'example';
  readonly resource: string;
}

export interface CompanionProviderLayer {
  readonly layer: LayerDescriptor;
  /** Kept beside the layer because core does not consume custom metadata. */
  readonly reference: CompanionProviderReference;
}

function requireName(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${label} must be a non-empty string`);
  }
}

/**
 * Creates one explicit provider layer. The source returns provider data only;
 * Kasane core retains normalization, merge, provenance, and redaction.
 */
export function companionProvider(
  name: string,
  options: CompanionProviderOptions,
): CompanionProviderLayer {
  requireName(name, 'name');
  requireName(options.resource, 'options.resource');
  if (typeof options.client.load !== 'function') {
    throw new TypeError('options.client.load must be a function');
  }
  if (options.secret !== undefined && typeof options.secret !== 'boolean') {
    throw new TypeError('options.secret must be a boolean');
  }

  const source: LayerSource = Object.freeze({
    kind: 'example-provider',
    load(context: SourceContext) {
      return options.client.load(options.resource, {
        ...(context.signal === undefined ? {} : { signal: context.signal }),
      });
    },
  });
  const layer: LayerDescriptor = Object.freeze({
    name,
    source,
    ...(options.secret === undefined ? {} : { secret: options.secret }),
  });
  const reference: CompanionProviderReference = Object.freeze({
    provider: 'example',
    resource: options.resource,
  });

  return Object.freeze({ layer, reference });
}
