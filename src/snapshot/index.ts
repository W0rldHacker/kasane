export { SNAPSHOT_PATH_CACHE_LIMIT, createConfigSnapshot } from './snapshot.js';
export { ConfigSnapshot } from './public.js';
export type { DeepReadonly, RedactedConfigNode } from '../public-types.js';
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
