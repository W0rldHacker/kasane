export { mergeConfigNodes } from './merge.js';
export type { MergeInput, MergeOutput, ProvenanceMode } from './merge.js';
export { isRemoveMarker, remove } from './remove.js';
export type {
  MergeLayerNode,
  MergeLayerObject,
  RemoveMarker,
} from './remove.js';
export { createMergeRuleIndex } from './rule-index.js';
export type { MergeRule, MergeRuleIndex } from './rule-index.js';
export {
  MERGE_STRATEGIES,
  configNodeKind,
  isMergeStrategy,
  resolveMergeDecision,
} from './strategy.js';
export type {
  ConfigNodeKind,
  ExistingValueKind,
  IncomingValueKind,
  MergeDecision,
  MergeMismatchReason,
  MergeOutcome,
  MergeStrategy,
} from './strategy.js';
