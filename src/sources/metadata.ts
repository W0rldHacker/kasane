import type { LayerSource, SourceContext, SourceMetadata } from './types.js';

export const sourceMetadata = Symbol('kasane.source-metadata');
export const builtInSource = Symbol('kasane.built-in-source');

export type SourceMetadataResolver = (context: SourceContext) => SourceMetadata;

export interface SourceWithMetadata extends LayerSource {
  readonly [sourceMetadata]: SourceMetadataResolver;
}

export interface BuiltInSource extends LayerSource {
  readonly [builtInSource]: true;
}

/** Identifies library-owned adapters whose thrown Kasane errors are trusted. */
export function isBuiltInSource(source: LayerSource): boolean {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(source, builtInSource);
    return (
      descriptor !== undefined &&
      'value' in descriptor &&
      descriptor.value === true
    );
  } catch {
    return false;
  }
}

export function getSourceMetadataResolver(
  source: LayerSource,
): SourceMetadataResolver | undefined {
  const candidate = (source as Partial<SourceWithMetadata>)[sourceMetadata];
  return typeof candidate === 'function' ? candidate : undefined;
}
