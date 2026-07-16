import { KasaneLayerError } from '../errors/index.js';
import {
  getRegistryIdentity,
  type LayerId,
  type LayerRecord,
  type LayerRegistry,
  type RegistryIdentity,
  type SourceReferenceId,
} from './registry.js';

export type LeafOperation = 'set' | 'replace';
export type StructuralOperation =
  'set' | 'replace' | 'merge' | 'append' | 'prepend';
export type RemoveOperation = 'remove';
export type ProvenanceOperation =
  LeafOperation | StructuralOperation | RemoveOperation;

interface OriginRecordBase {
  readonly layerId: LayerId;
  readonly inputReferenceId?: SourceReferenceId;
  readonly secret: boolean;
  readonly transformed?: true;
}

export interface LeafOriginRecord extends OriginRecordBase {
  readonly scope: 'leaf';
  readonly operation: LeafOperation;
}

export interface StructuralOriginRecord extends OriginRecordBase {
  readonly scope: 'container';
  readonly operation: StructuralOperation;
}

export interface RemoveOriginRecord extends OriginRecordBase {
  readonly scope: 'tombstone';
  readonly operation: RemoveOperation;
}

export type OriginRecord =
  LeafOriginRecord | StructuralOriginRecord | RemoveOriginRecord;

export type LeafOriginRecordInput = Omit<LeafOriginRecord, 'layerId'>;
export type StructuralOriginRecordInput = Omit<
  StructuralOriginRecord,
  'layerId'
>;
export type RemoveOriginRecordInput = Omit<RemoveOriginRecord, 'layerId'>;
export type OriginRecordInput =
  LeafOriginRecordInput | StructuralOriginRecordInput | RemoveOriginRecordInput;

export interface ResolvedOriginRecord {
  readonly layer: LayerRecord;
  readonly operation: ProvenanceOperation;
  readonly scope: OriginRecord['scope'];
  readonly secret: boolean;
  readonly transformed?: true;
  readonly sourceReference?: string;
  readonly inputReference?: string;
}

const owningRegistry = Symbol('kasane.origin-registry');

type OwnedOriginRecord = OriginRecord & {
  readonly [owningRegistry]: RegistryIdentity;
};

export function originBelongsToRegistry(
  registry: LayerRegistry,
  origin: OriginRecord,
): boolean {
  return (
    (origin as OwnedOriginRecord)[owningRegistry] ===
    getRegistryIdentity(registry)
  );
}

function originError(kind: string, layer?: LayerRecord): never {
  throw new KasaneLayerError('Provenance origin is invalid.', {
    details: {
      kind,
      operation: 'create-origin-record',
      ...(layer === undefined ? {} : { layerName: layer.name }),
    },
  });
}

/** Creates a compact origin whose strings remain in the owning registry. */
export function createOriginRecord(
  registry: LayerRegistry,
  layerId: LayerId,
  input: LeafOriginRecordInput,
): LeafOriginRecord;
export function createOriginRecord(
  registry: LayerRegistry,
  layerId: LayerId,
  input: StructuralOriginRecordInput,
): StructuralOriginRecord;
export function createOriginRecord(
  registry: LayerRegistry,
  layerId: LayerId,
  input: RemoveOriginRecordInput,
): RemoveOriginRecord;
export function createOriginRecord(
  registry: LayerRegistry,
  layerId: LayerId,
  input: OriginRecordInput,
): OriginRecord {
  const layer = registry.getLayer(layerId);
  if (layer === undefined) return originError('unknown-layer-id');

  if (
    input.inputReferenceId !== undefined &&
    registry.getReference(input.inputReferenceId) === undefined
  ) {
    return originError('unknown-source-reference-id', layer);
  }

  const record = {
    layerId,
    scope: input.scope,
    operation: input.operation,
    secret: input.secret,
    ...(input.inputReferenceId === undefined
      ? {}
      : { inputReferenceId: input.inputReferenceId }),
    ...(input.transformed === undefined
      ? {}
      : { transformed: input.transformed }),
  } as OwnedOriginRecord;

  Object.defineProperty(record, owningRegistry, {
    configurable: false,
    enumerable: false,
    value: getRegistryIdentity(registry),
    writable: false,
  });
  return Object.freeze(record);
}

/** Resolves safe strings and rejects a registry-local ID used cross-registry. */
export function resolveOriginRecord(
  registry: LayerRegistry,
  origin: OriginRecord,
): ResolvedOriginRecord {
  if (!originBelongsToRegistry(registry, origin)) {
    return originError('foreign-layer-id');
  }

  const layer = registry.getLayer(origin.layerId);
  if (layer === undefined) return originError('unknown-layer-id');

  const sourceReference =
    layer.sourceReferenceId === undefined
      ? undefined
      : registry.getReference(layer.sourceReferenceId);
  const inputReference =
    origin.inputReferenceId === undefined
      ? undefined
      : registry.getReference(origin.inputReferenceId);

  return Object.freeze({
    layer,
    operation: origin.operation,
    scope: origin.scope,
    secret: origin.secret,
    ...(origin.transformed === undefined
      ? {}
      : { transformed: origin.transformed }),
    ...(sourceReference === undefined ? {} : { sourceReference }),
    ...(inputReference === undefined ? {} : { inputReference }),
  });
}
