import path from 'node:path';
import process from 'node:process';

import {
  countConfigNodes,
  createEventEmitter,
  eventTimer,
} from './diagnostics/events.js';
import type { KasaneEventCallback } from './diagnostics/events.js';
import { safeNormalizedProvenanceRedaction } from './diagnostics/safe-json.js';
import {
  KasaneError,
  KasaneLayerError,
  KasaneMergeError,
  KasaneSourceError,
} from './errors/index.js';
import { prepareLayers } from './layers/index.js';
import type { PreparedLayer } from './layers/index.js';
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
import { createConfigSnapshot } from './snapshot/index.js';
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
import { resolveKasaneLimits } from './security/index.js';
import type { ResolvedKasaneLimits } from './security/index.js';
import type {
  LoadedLayer,
  SourceContext,
  SourceMetadata,
} from './sources/index.js';
import { isBuiltInSource } from './sources/index.js';
import type { ConfigSnapshot, KasaneOptions } from './public-types.js';

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

function resolveContext(
  options: KasaneOptions,
  limits: ResolvedKasaneLimits,
): SourceContext {
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
    limits: Object.freeze({ maxSourceBytes: limits.maxSourceBytes }),
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

function resolveEventCallback(value: unknown): KasaneEventCallback | undefined {
  if (value === undefined || typeof value === 'function') {
    return value as KasaneEventCallback | undefined;
  }
  return failOptions('invalid-event-callback');
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
    if (cause instanceof KasaneError && isBuiltInSource(layer.source)) {
      throw cause;
    }
    throw new KasaneSourceError('Configuration source failed.', {
      cause,
      details: {
        layerName: layer.name,
        kind: layer.kind,
        operation: 'load-layer',
      },
      secret: true,
    });
  }

  let metadata: SourceMetadata | undefined;
  try {
    metadata = layer.metadata?.call(layer.source, context);
  } catch (cause) {
    if (cause instanceof KasaneError && isBuiltInSource(layer.source)) {
      throw cause;
    }
    throw new KasaneSourceError('Configuration source metadata failed.', {
      cause,
      details: {
        layerName: layer.name,
        kind: layer.kind,
        operation: 'load-source-metadata',
      },
      secret: true,
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

/**
 * Runs the pipeline without runtime validation.
 *
 * An explicit `T` is a user assertion only; Kasane cannot verify it. Supply a
 * validator when the snapshot type must be derived from runtime evidence.
 */
export function kasane<T = ConfigNode>(
  options: KasaneOptions<undefined>,
): Promise<ConfigSnapshot<T>>;
/** Runs the pipeline and infers `snapshot.value` from validator output. */
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
  const limits = resolveKasaneLimits(invocationOptions.limits);
  const context = resolveContext(invocationOptions, limits);
  const emit = createEventEmitter(
    resolveEventCallback(invocationOptions.onEvent),
  );
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
    const identity = { kind: layer.kind, layer: layer.name } as const;
    emit({ ...identity, type: 'source:start' });
    const sourceDuration = eventTimer();
    let loaded: LoadedLayer;
    let normalized: ReturnType<typeof normalizeAnnotatedLayerNode>;
    try {
      loaded = await loadLayer(layer, context);
      checkAbort(context.signal, layer);
      normalized = normalizeAnnotatedLayerNode(loaded.value, limits);
      if (loaded.metadata !== undefined) {
        registerLayerSourceMetadata(registry, layer.name, loaded.metadata);
      }
      emit({
        ...identity,
        durationMs: sourceDuration(),
        nodes: countConfigNodes(normalized.value),
        success: true,
        type: 'source:end',
      });
    } catch (error) {
      emit({
        ...identity,
        durationMs: sourceDuration(),
        nodes: 0,
        success: false,
        type: 'source:end',
      });
      throw error;
    }
    const record = registry.getLayerByName(layer.name);
    if (record === undefined) return failOptions('missing-layer-registration');
    const references = pathReferenceIds(loaded.metadata, registry);

    emit({ ...identity, type: 'merge:start' });
    const mergeDuration = eventTimer();
    try {
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
      emit({
        ...identity,
        durationMs: mergeDuration(),
        nodes: countConfigNodes(merged.value),
        success: true,
        type: 'merge:end',
      });
    } catch (error) {
      emit({
        ...identity,
        durationMs: mergeDuration(),
        nodes: 0,
        success: false,
        type: 'merge:end',
      });
      throw error;
    }
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
    const validationIdentity = {
      kind: 'validation',
      layer: 'validation',
    } as const;
    emit({ ...validationIdentity, type: 'validation:start' });
    const validationDuration = eventTimer();
    try {
      const validated = await validateConfigValue(
        finalValue,
        validation,
        {
          ...(fingerprintKey === undefined ? {} : { fingerprintKey }),
          includeSource: provenanceMode !== 'none',
          provenance: preValidationProvenance,
          registry,
          value: finalValue,
        },
        limits,
      );
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
      emit({
        ...validationIdentity,
        durationMs: validationDuration(),
        nodes: countConfigNodes(finalValue),
        success: true,
        type: 'validation:end',
      });
    } catch (error) {
      emit({
        ...validationIdentity,
        durationMs: validationDuration(),
        nodes: 0,
        success: false,
        type: 'validation:end',
      });
      throw error;
    }
  }

  const snapshotDuration = eventTimer();
  try {
    if (finalValue === undefined) return failAbsentRoot();
    const provenance =
      provenanceMode === 'none' ? undefined : workingProvenance;
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

    const snapshot = createConfigSnapshot<unknown>(finalValue, {
      ...(invocationOptions.freeze === undefined
        ? {}
        : { freeze: invocationOptions.freeze }),
      ...(provenance === undefined ? {} : { provenance }),
      ...(redactedValue === undefined ? {} : { redactedValue }),
      registry,
      secretFingerprints,
    });
    emit({
      durationMs: snapshotDuration(),
      nodes: countConfigNodes(finalValue),
      success: true,
      type: 'snapshot:created',
    });
    return snapshot;
  } catch (error) {
    emit({
      durationMs: snapshotDuration(),
      nodes: 0,
      success: false,
      type: 'snapshot:created',
    });
    throw error;
  }
}
