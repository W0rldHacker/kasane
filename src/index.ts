/** Public ESM entry point. */
export { kasane } from './kasane.js';
export type { KasaneOptions, MergeRuleDeclarations } from './kasane.js';
export { value } from './layers/value.js';
export { file } from './layers/file.js';
export { env } from './layers/env.js';
export { secret } from './layers/secret.js';
export type {
  EnvLayerOptions,
  EnvMap,
  EnvMapEntry,
  EnvParser,
  EnvSource,
} from './layers/env.js';
export type { FileLayerOptions, FileParser } from './layers/file.js';
export type { SecretLayerOptions, SecretLoader } from './layers/secret.js';
export type { LayerDescriptor } from './layers/types.js';
export type { ValueLayerOptions } from './layers/value.js';
export type { MergeStrategy, ProvenanceMode } from './merge/index.js';
export type {
  LayerSource,
  LoadedLayer,
  SourceContext,
  SourceMetadata,
  SourcePathReference,
} from './sources/index.js';
export { remove } from './merge/remove.js';
export { secretValue } from './secrets/secret-value.js';
export type { SecretValue } from './secrets/secret-value.js';
export {
  KasaneError,
  KasaneLayerError,
  KasaneMergeError,
  KasanePathError,
  KasaneSecurityError,
  KasaneSourceError,
  KasaneValidationError,
} from './errors/index.js';
export { ConfigSnapshot } from './snapshot/snapshot.js';
export type {
  ConfigSnapshotOptions,
  DeepReadonly,
  RedactedConfigNode,
} from './snapshot/snapshot.js';
export type {
  Explanation,
  ExplanationData,
  ExplanationHistoryEntry,
  FoundExplanationData,
  MissingExplanationData,
  Origin,
} from './provenance/explanation.js';
