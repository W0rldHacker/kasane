import { KasaneLayerError } from '../errors/index.js';

declare const layerIdBrand: unique symbol;
declare const sourceReferenceIdBrand: unique symbol;

/** Registry-local numeric handle stored by provenance records. */
export type LayerId = number & { readonly [layerIdBrand]: true };

/** Registry-local numeric handle for a deduplicated safe source reference. */
export type SourceReferenceId = number & {
  readonly [sourceReferenceIdBrand]: true;
};

/**
 * The deliberately small allowlist of source metadata accepted by provenance.
 * References identify an input (a file path, env name, provider key, and so on)
 * and must never be the input's configuration value.
 */
export interface SafeSourceMetadataInput {
  readonly reference?: string;
  readonly inputReferences?: readonly string[];
}

export interface LayerRegistration {
  readonly name: string;
  readonly kind: string;
  readonly source?: SafeSourceMetadataInput;
}

export interface LayerRecord {
  readonly id: LayerId;
  readonly name: string;
  readonly kind: string;
  readonly sourceReferenceId?: SourceReferenceId;
}

export interface LayerRegistry {
  readonly size: number;
  readonly referenceCount: number;
  getLayer(id: LayerId): LayerRecord | undefined;
  getLayerByName(name: string): LayerRecord | undefined;
  getReference(id: SourceReferenceId): string | undefined;
  getReferenceId(reference: string): SourceReferenceId | undefined;
}

/** An unforgeable invocation-local registry identity. */
export type RegistryIdentity = object;

const registryIdentity = Symbol('kasane.layer-registry-identity');

interface OwnedLayerRegistry extends LayerRegistry {
  readonly [registryIdentity]: RegistryIdentity;
}

function registryError(
  kind: string,
  registration?: Readonly<{ name?: string; reference?: string }>,
): never {
  throw new KasaneLayerError('Layer registry declaration is invalid.', {
    details: {
      kind,
      operation: 'create-layer-registry',
      ...(registration?.name === undefined
        ? {}
        : { layerName: registration.name }),
      ...(registration?.reference === undefined
        ? {}
        : { reference: registration.reference }),
    },
  });
}

function requireNonEmptyString(
  value: string,
  kind: string,
  registration?: Readonly<{ name?: string }>,
): void {
  if (value.length === 0) registryError(kind, registration);
}

function addReference(
  reference: string,
  references: string[],
  referencesByValue: Map<string, SourceReferenceId>,
  layerName: string,
): SourceReferenceId {
  requireNonEmptyString(reference, 'empty-source-reference', {
    name: layerName,
  });

  const existing = referencesByValue.get(reference);
  if (existing !== undefined) return existing;

  const id = references.length as SourceReferenceId;
  references.push(reference);
  referencesByValue.set(reference, id);
  return id;
}

class ImmutableLayerRegistry implements OwnedLayerRegistry {
  readonly #layers: readonly LayerRecord[];
  readonly #layersByName: ReadonlyMap<string, LayerRecord>;
  readonly #references: readonly string[];
  readonly #referencesByValue: ReadonlyMap<string, SourceReferenceId>;
  readonly [registryIdentity]: RegistryIdentity;
  readonly size: number;
  readonly referenceCount: number;

  constructor(
    layers: readonly LayerRecord[],
    layersByName: ReadonlyMap<string, LayerRecord>,
    references: readonly string[],
    referencesByValue: ReadonlyMap<string, SourceReferenceId>,
  ) {
    this.#layers = layers;
    this.#layersByName = layersByName;
    this.#references = references;
    this.#referencesByValue = referencesByValue;
    this[registryIdentity] = Object.freeze({});
    this.size = layers.length;
    this.referenceCount = references.length;
    Object.freeze(this);
  }

  getLayer(id: LayerId): LayerRecord | undefined {
    return this.#layers[id];
  }

  getLayerByName(name: string): LayerRecord | undefined {
    return this.#layersByName.get(name);
  }

  getReference(id: SourceReferenceId): string | undefined {
    return this.#references[id];
  }

  getReferenceId(reference: string): SourceReferenceId | undefined {
    return this.#referencesByValue.get(reference);
  }
}

/** Creates one immutable, invocation-local layer and safe-reference registry. */
export function createLayerRegistry(
  registrations: readonly LayerRegistration[],
): LayerRegistry {
  const layers: LayerRecord[] = [];
  const layersByName = new Map<string, LayerRecord>();
  const references: string[] = [];
  const referencesByValue = new Map<string, SourceReferenceId>();

  for (const registration of registrations) {
    requireNonEmptyString(registration.name, 'empty-layer-name');
    requireNonEmptyString(registration.kind, 'empty-layer-kind', {
      name: registration.name,
    });
    if (layersByName.has(registration.name)) {
      registryError('duplicate-layer-name', { name: registration.name });
    }

    const sourceReferenceId =
      registration.source?.reference === undefined
        ? undefined
        : addReference(
            registration.source.reference,
            references,
            referencesByValue,
            registration.name,
          );

    for (const reference of registration.source?.inputReferences ?? []) {
      addReference(reference, references, referencesByValue, registration.name);
    }

    const record: LayerRecord = Object.freeze({
      id: layers.length as LayerId,
      name: registration.name,
      kind: registration.kind,
      ...(sourceReferenceId === undefined ? {} : { sourceReferenceId }),
    });
    layers.push(record);
    layersByName.set(record.name, record);
  }

  return new ImmutableLayerRegistry(
    Object.freeze(layers),
    layersByName,
    Object.freeze(references),
    referencesByValue,
  );
}

export function getRegistryIdentity(registry: LayerRegistry): RegistryIdentity {
  if (!(registry instanceof ImmutableLayerRegistry)) {
    return registryError('unknown-layer-registry');
  }
  return registry[registryIdentity];
}
