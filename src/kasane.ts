import path from 'node:path';
import process from 'node:process';

import { safeNormalizedRedaction } from './diagnostics/safe-json.js';
import {
  KasaneError,
  KasaneLayerError,
  KasaneMergeError,
  KasaneSourceError,
} from './errors/index.js';
import { prepareLayers } from './layers/index.js';
import type { LayerDescriptor, PreparedLayer } from './layers/index.js';
import {
  createMergeRuleIndex,
  isRemoveMarker,
  mergeConfigNodes,
} from './merge/index.js';
import type {
  MergeLayerNode,
  MergeOutput,
  MergeRule,
  MergeStrategy,
  ProvenanceMode,
} from './merge/index.js';
import { normalizeAnnotatedLayerNode } from './normalize/index.js';
import type { ConfigNode } from './normalize/types.js';
import {
  createLayerRegistry,
  registerLayerSourceMetadata,
} from './provenance/registry.js';
import type {
  LayerRegistry,
  SourceReferenceId,
} from './provenance/registry.js';
import { ConfigSnapshot } from './snapshot/index.js';
import {
  applySecretPathPolicy,
  createSecretPathMatcher,
  isInSecretSubtree,
} from './secrets/index.js';
import type {
  LoadedLayer,
  SourceContext,
  SourceMetadata,
} from './sources/index.js';

export type MergeRuleDeclarations = Readonly<Record<string, MergeStrategy>>;

export interface KasaneOptions {
  readonly layers: readonly LayerDescriptor[];
  readonly cwd?: string;
  readonly freeze?: boolean;
  readonly merge?: MergeRuleDeclarations;
  readonly provenance?: ProvenanceMode;
  readonly secrets?: readonly string[];
  readonly signal?: AbortSignal;
}

function failOptions(kind: string): never {
  throw new KasaneLayerError('Kasane options are invalid.', {
    details: { kind, operation: 'validate-options' },
  });
}

function failAbsentRoot(): never {
  throw new KasaneMergeError('Configuration root is absent.', {
    details: { path: '', kind: 'absent-root', operation: 'create-snapshot' },
  });
}

function checkAbort(
  signal: AbortSignal | undefined,
  layer?: PreparedLayer,
): void {
  if (signal?.aborted !== true) return;

  throw new KasaneSourceError('Configuration loading was aborted.', {
    details: {
      kind: 'aborted',
      operation: 'load-layer',
      ...(layer === undefined ? {} : { layerName: layer.name }),
    },
  });
}

function resolveContext(options: KasaneOptions): SourceContext {
  const invocationCwd = process.cwd();
  const configuredCwd = options.cwd ?? invocationCwd;
  if (typeof configuredCwd !== 'string' || configuredCwd.length === 0) {
    return failOptions('invalid-cwd');
  }
  if (options.freeze !== undefined && typeof options.freeze !== 'boolean') {
    return failOptions('invalid-freeze');
  }
  if (options.signal !== undefined && !isAbortSignal(options.signal)) {
    return failOptions('invalid-signal');
  }

  return Object.freeze({
    cwd: path.resolve(invocationCwd, configuredCwd),
    ...(options.signal === undefined ? {} : { signal: options.signal }),
  });
}

function isAbortSignal(value: unknown): value is AbortSignal {
  if (typeof value !== 'object' || value === null) return false;
  const signal = value as Partial<AbortSignal>;
  return (
    typeof signal.aborted === 'boolean' &&
    typeof signal.addEventListener === 'function' &&
    typeof signal.removeEventListener === 'function'
  );
}

function resolveProvenanceMode(
  provenance: unknown,
): ProvenanceMode | undefined {
  if (
    provenance !== undefined &&
    provenance !== 'none' &&
    provenance !== 'origin-only' &&
    provenance !== 'full'
  ) {
    return failOptions('invalid-provenance-mode');
  }
  return provenance;
}

function resolveRules(
  declarations: unknown,
): ReturnType<typeof createMergeRuleIndex> {
  if (declarations === undefined) return createMergeRuleIndex([]);
  if (
    typeof declarations !== 'object' ||
    declarations === null ||
    Array.isArray(declarations)
  ) {
    return failOptions('invalid-merge-rules');
  }

  const rules: MergeRule[] = Object.entries(declarations).map(
    ([rulePath, strategy]) => ({
      path: rulePath,
      strategy: strategy as MergeStrategy,
    }),
  );
  return createMergeRuleIndex(rules);
}

async function loadLayer(
  layer: PreparedLayer,
  context: SourceContext,
): Promise<LoadedLayer> {
  let loadedValue: unknown;
  try {
    loadedValue = await layer.load.call(layer.source, context);
  } catch (cause) {
    if (cause instanceof KasaneError) throw cause;
    throw new KasaneSourceError('Configuration source failed.', {
      cause,
      details: {
        layerName: layer.name,
        kind: layer.kind,
        operation: 'load-layer',
      },
    });
  }

  let metadata: SourceMetadata | undefined;
  try {
    metadata = layer.metadata?.call(layer.source, context);
  } catch (cause) {
    if (cause instanceof KasaneError) throw cause;
    throw new KasaneSourceError('Configuration source metadata failed.', {
      cause,
      details: {
        layerName: layer.name,
        kind: layer.kind,
        operation: 'load-source-metadata',
      },
    });
  }

  return Object.freeze({
    kind: layer.kind,
    name: layer.name,
    value: loadedValue,
    ...(metadata === undefined ? {} : { metadata }),
  });
}

function pathReferenceIds(
  metadata: SourceMetadata | undefined,
  registry: LayerRegistry,
): ReadonlyMap<string, SourceReferenceId> | undefined {
  if (metadata?.pathReferences === undefined) return undefined;

  const references = new Map<string, SourceReferenceId>();
  for (const pathReference of metadata.pathReferences) {
    const referenceId = registry.getReferenceId(pathReference.reference);
    if (referenceId === undefined)
      return failOptions('missing-source-reference');
    if (references.has(pathReference.path)) {
      return failOptions('duplicate-source-path-reference');
    }
    references.set(pathReference.path, referenceId);
  }
  return references;
}

/** Runs the strictly sequential load → normalize → merge → snapshot pipeline. */
export function kasane<T = ConfigNode>(
  options: KasaneOptions,
): Promise<ConfigSnapshot<T>>;
export async function kasane<T = ConfigNode>(
  options: unknown,
): Promise<ConfigSnapshot<T>> {
  if (typeof options !== 'object' || options === null) {
    return failOptions('invalid-options');
  }

  const invocationOptions = options as KasaneOptions;
  const context = resolveContext(invocationOptions);
  const layers = prepareLayers(invocationOptions.layers);
  const enabledLayers = layers.filter((layer) => layer.enabled);
  const rules = resolveRules(invocationOptions.merge);
  const provenanceMode = resolveProvenanceMode(invocationOptions.provenance);
  const secretPolicy = createSecretPathMatcher(invocationOptions.secrets);
  const registry = createLayerRegistry(
    enabledLayers.map((layer) => ({ kind: layer.kind, name: layer.name })),
  );

  checkAbort(context.signal);
  let merged: MergeOutput | undefined;
  let redactedMerged: MergeOutput | undefined;

  for (const layer of enabledLayers) {
    checkAbort(context.signal, layer);
    const loaded = await loadLayer(layer, context);
    checkAbort(context.signal, layer);
    if (loaded.metadata !== undefined) {
      registerLayerSourceMetadata(registry, layer.name, loaded.metadata);
    }
    const normalized = normalizeAnnotatedLayerNode(loaded.value);
    const record = registry.getLayerByName(layer.name);
    if (record === undefined) return failOptions('missing-layer-registration');
    const references = pathReferenceIds(loaded.metadata, registry);

    if (provenanceMode === 'none') {
      const redactedLayer = safeNormalizedRedaction(
        normalized.value,
        {
          matches(path: string): boolean {
            return (
              layer.secret ||
              isInSecretSubtree(normalized.secretPaths, path) ||
              secretPolicy.matches(path)
            );
          },
        },
        isRemoveMarker,
      ) as MergeLayerNode;
      redactedMerged = mergeConfigNodes({
        base: redactedMerged?.value,
        layer: redactedLayer,
        layerId: record.id,
        provenanceMode: 'none',
        registry,
        rules,
      });
    }

    merged = mergeConfigNodes({
      base: merged?.value,
      layer: normalized.value,
      layerId: record.id,
      registry,
      rules,
      secret: layer.secret,
      secretPaths: normalized.secretPaths,
      secretPolicy,
      ...(references === undefined ? {} : { inputReferenceIds: references }),
      ...(merged?.provenance === undefined
        ? {}
        : { baseProvenance: merged.provenance }),
      ...(provenanceMode === undefined ? {} : { provenanceMode }),
    });
  }

  checkAbort(context.signal);
  if (merged?.value === undefined) return failAbsentRoot();
  const provenance =
    merged.provenance === undefined
      ? undefined
      : applySecretPathPolicy(merged.provenance, registry, secretPolicy);

  return new ConfigSnapshot<T>(merged.value as T & ConfigNode, {
    ...(invocationOptions.freeze === undefined
      ? {}
      : { freeze: invocationOptions.freeze }),
    ...(provenance === undefined ? {} : { provenance }),
    ...(redactedMerged?.value === undefined
      ? {}
      : { redactedValue: redactedMerged.value }),
    registry,
  });
}
