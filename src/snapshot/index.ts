export { SNAPSHOT_PATH_CACHE_LIMIT, ConfigSnapshot } from './snapshot.js';
export type {
  ConfigSnapshotOptions,
  DeepReadonly,
  RedactedConfigNode,
  SnapshotRedactor,
} from './snapshot.js';
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
} from './diff.js';
export type {
  Explanation,
  ExplanationData,
  ExplanationHistoryEntry,
  FoundExplanationData,
  MissingExplanationData,
  Origin,
} from '../provenance/explanation.js';
export { cloneConfigNode, deepFreezeConfigNode } from './freeze.js';
