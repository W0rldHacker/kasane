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
