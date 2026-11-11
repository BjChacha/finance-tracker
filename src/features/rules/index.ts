export {
  keywordFromNote,
  matchTransaction,
  matchesRule,
  validateRuleInput,
  type MatchableRule,
  type RuleMatchInput,
  type RuleValidationError,
} from './model';
export {
  listRules,
  upsertRule,
  removeRule,
  setRuleEnabled,
  touchRuleMatch,
  type RuleInput,
  type RuleListItem,
} from './repository';
export {
  useCategoryStats,
  useRemoveRule,
  useRuleSuggestion,
  useRules,
  useSetRuleEnabled,
  useUpsertRule,
} from './hooks';
export { getCategoryStats, hitRate, recordCategoryOutcome, type CategoryStats } from './stats';
export { rulesText } from './labels';
