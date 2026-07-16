import { KasaneLayerError } from '../errors/index.js';
import { getSourceMetadataResolver } from '../sources/index.js';
import type { LayerSource, SourceMetadataResolver } from '../sources/index.js';
import type { LayerDescriptor, PreparedLayer } from './types.js';

function failLayer(
  kind: string,
  details: Readonly<{ layerName?: string; sourceKind?: string }> = {},
): never {
  throw new KasaneLayerError('Layer declaration is invalid.', {
    details: {
      kind,
      operation: 'validate-layers',
      ...(details.layerName === undefined
        ? {}
        : { layerName: details.layerName }),
      ...(details.sourceKind === undefined
        ? {}
        : { reference: details.sourceKind }),
    },
  });
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validIdentifier(value: unknown): value is string {
  return (
    typeof value === 'string' && value.length > 0 && value.trim() === value
  );
}

function prepareSource(
  source: unknown,
  layerName: string,
): Readonly<{
  kind: string;
  load: LayerSource['load'];
  metadata?: SourceMetadataResolver;
  source: LayerSource;
}> {
  if (!isObject(source)) return failLayer('invalid-source', { layerName });

  const kind = source['kind'];
  if (!validIdentifier(kind)) {
    return failLayer('invalid-source-kind', { layerName });
  }

  const load = source['load'];
  if (typeof load !== 'function') {
    return failLayer('invalid-source-load', { layerName, sourceKind: kind });
  }

  const metadata = getSourceMetadataResolver(source as unknown as LayerSource);
  return {
    kind,
    load: load as LayerSource['load'],
    ...(metadata === undefined ? {} : { metadata }),
    source: source as unknown as LayerSource,
  };
}

/** Validates every declaration before orchestration invokes the first source. */
export function prepareLayers(
  declarations: readonly LayerDescriptor[],
): readonly PreparedLayer[] {
  if (!Array.isArray(declarations)) return failLayer('invalid-layers');

  const names = new Set<string>();
  const prepared: PreparedLayer[] = [];

  for (const declaration of declarations as readonly unknown[]) {
    if (!isObject(declaration)) return failLayer('invalid-layer');

    const name = declaration['name'];
    if (!validIdentifier(name)) return failLayer('invalid-layer-name');
    if (names.has(name))
      return failLayer('duplicate-layer-name', { layerName: name });
    names.add(name);

    const enabledValue = declaration['enabled'];
    if (enabledValue !== undefined && typeof enabledValue !== 'boolean') {
      return failLayer('invalid-enabled', { layerName: name });
    }

    const source = prepareSource(declaration['source'], name);
    prepared.push(
      Object.freeze({
        enabled: enabledValue !== false,
        kind: source.kind,
        load: source.load,
        ...(source.metadata === undefined ? {} : { metadata: source.metadata }),
        name,
        source: source.source,
      }),
    );
  }

  return Object.freeze(prepared);
}
