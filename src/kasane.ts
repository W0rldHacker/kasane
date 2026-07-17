import path from 'node:path';
import process from 'node:process';

import { safeNormalizedProvenanceRedaction } from './diagnostics/safe-json.js';
import {
  KasaneError,
  KasaneLayerError,
  KasaneMergeError,
  KasaneSourceError,
} from './errors/index.js';
import { prepareLayers } from './layers/index.js';
import type { LayerDescriptor, PreparedLayer } from './layers/index.js';
import { createMergeRuleIndex, mergeConfigNodes } from './merge/index.js';
import type {
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
import { createSecretFingerprintIndex } from './snapshot/diff.js';
import {
  applySecretPathPolicy,
  createSecretPathMatcher,
} from './secrets/index.js';
import type { FingerprintKey } from './secrets/index.js';
import {
  prepareValidation,
  reconcileValidationProvenance,
  validateConfigValue,
} from './validation/index.js';
import type {
  InferValidationOutput,
  ValidationAdapter,
} from './validation/index.js';
import { createProvenanceTree } from './provenance/tree.js';
import type {
  LoadedLayer,
  SourceContext,
  SourceMetadata,
} from './sources/index.js';

export type MergeRuleDeclarations = Readonly<Record<string, MergeStrategy>>;

export interface KasaneOptions<
  Validation extends ValidationAdapter | undefined =
    ValidationAdapter | undefined,
> {
  readonly layers: readonly LayerDescriptor[];
  readonly cwd?: string;
  readonly fingerprintKey?: FingerprintKey;
  readonly freeze?: boolean;
  readonly merge?: MergeRuleDeclarations;
  readonly provenance?: ProvenanceMode;
  readonly secrets?: readonly string[];
  readonly signal?: AbortSignal;
  readonly validate?: Validation;
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

function resolveFingerprintKey(key: unknown): FingerprintKey | undefined {
  if (key === undefined || typeof key === 'string') return key;
  if (key instanceof Uint8Array) return new Uint8Array(key);
  return failOptions('invalid-fingerprint-key');
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
  options: KasaneOptions<undefined>,
): Promise<ConfigSnapshot<T>>;
export function kasane<Validation extends ValidationAdapter>(
  options: KasaneOptions<Validation> & Readonly<{ validate: Validation }>,
): Promise<ConfigSnapshot<InferValidationOutput<Validation>>>;
export async function kasane(
  options: unknown,
): Promise<ConfigSnapshot<unknown>> {
  if (typeof options !== 'object' || options === null) {
    return failOptions('invalid-options');
  }

  const invocationOptions = options as KasaneOptions;
  const context = resolveContext(invocationOptions);
  const fingerprintKey = resolveFingerprintKey(
    invocationOptions.fingerprintKey,
  );
  const layers = prepareLayers(invocationOptions.layers);
  const enabledLayers = layers.filter((layer) => layer.enabled);
  const validation = prepareValidation(invocationOptions.validate);
  if (
    validation !== undefined &&
    enabledLayers.some((layer) => layer.name === 'validation')
  ) {
    return failOptions('reserved-validation-layer-name');
  }
  const rules = resolveRules(invocationOptions.merge);
  const provenanceMode = resolveProvenanceMode(invocationOptions.provenance);
  const mergeProvenanceMode =
    provenanceMode === 'none' ? 'origin-only' : provenanceMode;
  const secretPolicy = createSecretPathMatcher(invocationOptions.secrets);
  const registry = createLayerRegistry([
    ...enabledLayers.map((layer) => ({
      kind: layer.kind,
      name: layer.name,
    })),
    ...(validation === undefined
      ? []
      : [{ kind: 'validation', name: 'validation' }]),
  ]);

  checkAbort(context.signal);
  let merged: MergeOutput | undefined;

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

    merged = mergeConfigNodes({
      base: merged?.value,
      layer: normalized.value,
      layerId: record.id,
      ...(fingerprintKey === undefined ? {} : { fingerprintKey }),
      registry,
      rules,
      secret: layer.secret,
      secretPaths: normalized.secretPaths,
      secretPolicy,
      ...(references === undefined ? {} : { inputReferenceIds: references }),
      ...(merged?.provenance === undefined
        ? {}
        : { baseProvenance: merged.provenance }),
      ...(mergeProvenanceMode === undefined
        ? {}
        : { provenanceMode: mergeProvenanceMode }),
    });
  }

  checkAbort(context.signal);
  let finalValue = merged?.value;
  let workingProvenance =
    merged?.provenance === undefined
      ? undefined
      : applySecretPathPolicy(
          merged.provenance,
          registry,
          secretPolicy,
          fingerprintKey,
        );

  if (validation !== undefined) {
    const validationLayer = registry.getLayerByName('validation');
    if (validationLayer === undefined) {
      return failOptions('missing-validation-layer');
    }
    const preValidationProvenance =
      workingProvenance ??
      createProvenanceTree(
        undefined,
        mergeProvenanceMode === 'full' ? 'full' : 'origin-only',
      );
    const validated = await validateConfigValue(finalValue, validation, {
      ...(fingerprintKey === undefined ? {} : { fingerprintKey }),
      includeSource: provenanceMode !== 'none',
      provenance: preValidationProvenance,
      registry,
      value: finalValue,
    });
    checkAbort(context.signal);
    workingProvenance = applySecretPathPolicy(
      reconcileValidationProvenance({
        after: validated,
        before: finalValue,
        ...(fingerprintKey === undefined ? {} : { fingerprintKey }),
        provenance: preValidationProvenance,
        registry,
        validationLayerId: validationLayer.id,
      }),
      registry,
      secretPolicy,
      fingerprintKey,
    );
    finalValue = validated;
  }

  if (finalValue === undefined) return failAbsentRoot();
  const provenance = provenanceMode === 'none' ? undefined : workingProvenance;
  const redactedValue =
    provenanceMode === 'none' && workingProvenance !== undefined
      ? (safeNormalizedProvenanceRedaction(
          finalValue,
          workingProvenance,
          secretPolicy,
        ) as ConfigNode)
      : undefined;
  const secretFingerprints = createSecretFingerprintIndex(
    finalValue,
    workingProvenance,
    fingerprintKey,
  );

  return new ConfigSnapshot<unknown>(finalValue, {
    ...(invocationOptions.freeze === undefined
      ? {}
      : { freeze: invocationOptions.freeze }),
    ...(provenance === undefined ? {} : { provenance }),
    ...(redactedValue === undefined ? {} : { redactedValue }),
    registry,
    secretFingerprints,
  });
}
