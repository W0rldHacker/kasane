# Kasane public API report

This report snapshots the package-root declaration surface. Update it only for
an intentional public API change; `pnpm api:check` also rejects explicit `any`,
external type dependencies, and private implementation names in public facades.

<!-- API-REPORT:START -->

```ts
/** Public ESM entry point. */
export { kasane } from './kasane.js';
export type {
  DeepReadonly,
  KasaneOptions,
  MergeRuleDeclarations,
  RedactedConfigNode,
} from './public-types.js';
export {
  DEFAULT_KASANE_LIMITS,
  DEFAULT_MAX_SOURCE_BYTES,
} from './security/index.js';
export type { KasaneLimits, ResolvedKasaneLimits } from './security/index.js';
export type {
  CompletedEventMetrics,
  KasaneEvent,
  KasaneEventCallback,
  KasaneEventType,
  LayerEventIdentity,
  MergeEndEvent,
  MergeStartEvent,
  SnapshotCreatedEvent,
  SourceEndEvent,
  SourceStartEvent,
  ValidationEndEvent,
  ValidationStartEvent,
} from './diagnostics/events.js';
export type {
  ConfigIssue,
  ConfigIssuePrevious,
  FunctionValidator,
  InferValidationOutput,
  ValidationAdapter,
} from './validation/index.js';
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
  SourceLimits,
  SourceContext,
  SourceMetadata,
  SourcePathReference,
} from './sources/index.js';
export { remove } from './merge/remove.js';
export { secretValue } from './secrets/secret-value.js';
export type { SecretValue } from './secrets/secret-value.js';
export type {
  FingerprintKey,
  SecretFingerprint,
} from './secrets/fingerprint.js';
export {
  KasaneError,
  KasaneLayerError,
  KasaneMergeError,
  KasanePathError,
  KasaneSecurityError,
  KasaneSourceError,
  KasaneValidationError,
} from './errors/index.js';
export type {
  KasaneCauseSummary,
  KasaneErrorDetails,
  KasaneErrorDetailsInput,
  KasaneErrorJson,
  KasaneErrorOptions,
} from './errors/kasane-error.js';
export { ConfigSnapshot } from './snapshot/public.js';
export type {
  AddedConfigChange,
  AvailableDiffSource,
  ConfigChange,
  ConfigChangeType,
  ConfigDiff,
  ConfigDiffSide,
  DiffSource,
  RemovedConfigChange,
  SourceChangedConfigChange,
  UnavailableDiffSource,
  ValueAndSourceChangedConfigChange,
  ValueChangedConfigChange,
} from './snapshot/diff.js';
export type {
  Explanation,
  ExplanationData,
  ExplanationHistoryEntry,
  ExplanationMethods,
  ExplanationOperationHistoryEntry,
  ExplanationRedactedHistoryEntry,
  ExplanationValueHistoryEntry,
  FoundExplanationData,
  MissingExplanationData,
  Origin,
  OriginLayer,
} from './provenance/explanation.js';
```

<!-- API-REPORT:END -->
