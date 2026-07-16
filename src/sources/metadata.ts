import type { LayerSource, SourceContext, SourceMetadata } from './types.js';

export const sourceMetadata = Symbol('kasane.source-metadata');

export type SourceMetadataResolver = (context: SourceContext) => SourceMetadata;

export interface SourceWithMetadata extends LayerSource {
  readonly [sourceMetadata]: SourceMetadataResolver;
}

export function getSourceMetadataResolver(
  source: LayerSource,
): SourceMetadataResolver | undefined {
  const candidate = (source as Partial<SourceWithMetadata>)[sourceMetadata];
  return typeof candidate === 'function' ? candidate : undefined;
}
