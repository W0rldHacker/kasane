/** Public ESM entry point. */
export { kasane } from './kasane.js';
export type { KasaneOptions, MergeRuleDeclarations } from './kasane.js';
export { value } from './layers/value.js';
export { file } from './layers/file.js';
export type { FileLayerOptions, FileParser } from './layers/file.js';
export type { LayerDescriptor } from './layers/types.js';
export type { ValueLayerOptions } from './layers/value.js';
export type { MergeStrategy, ProvenanceMode } from './merge/index.js';
export type {
  LayerSource,
  LoadedLayer,
  SourceContext,
  SourceMetadata,
} from './sources/index.js';
export { remove } from './merge/remove.js';
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
