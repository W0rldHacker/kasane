/** Scalar values accepted by the canonical configuration model. */
export type ConfigPrimitive = null | boolean | number | string;

/** A dense, ordered collection of canonical configuration nodes. */
export type ConfigArray = ConfigNode[];

/** A plain string-keyed mapping of canonical configuration nodes. */
export interface ConfigObject {
  [key: string]: ConfigNode;
}

/** The only value representation consumed by merge, provenance, and diff. */
export type ConfigNode = ConfigPrimitive | ConfigArray | ConfigObject;
