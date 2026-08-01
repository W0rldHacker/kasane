export {
  composeEventAdapters,
  createDiagnosticsChannelBridge,
  createOtelEventAdapter,
  DEFAULT_DIAGNOSTICS_CHANNEL,
  MAX_ACTIVE_PROTOTYPE_SPANS,
  safeLifecycleRecord,
} from './telemetry.js';
export type {
  PrototypeSpan,
  PrototypeTracer,
  TelemetryAttribute,
  TelemetryAttributes,
} from './telemetry.js';
export { pollRemote } from './polling.js';
export type { RemotePollOptions } from './polling.js';
export {
  operationToStableStrategy,
  parseMergeOperation,
} from './merge-operation.js';
export type { ConstrainedMergeOperation } from './merge-operation.js';
export { typedPaths } from './typed-paths.js';
export type {
  TypedPath,
  TypedPathDepth,
  TypedPathOptions,
  TypedPathReader,
  TypedPathValue,
} from './typed-paths.js';
