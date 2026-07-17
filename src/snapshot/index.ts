export { SNAPSHOT_PATH_CACHE_LIMIT, ConfigSnapshot } from './snapshot.js';
export type {
  ConfigSnapshotOptions,
  DeepReadonly,
  RedactedConfigNode,
  SnapshotRedactor,
} from './snapshot.js';
export type {
  Explanation,
  ExplanationData,
  ExplanationHistoryEntry,
  FoundExplanationData,
  MissingExplanationData,
  Origin,
} from '../provenance/explanation.js';
export { cloneConfigNode, deepFreezeConfigNode } from './freeze.js';
