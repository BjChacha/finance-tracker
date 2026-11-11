export { InsightsSection } from './components';
export { InsightRunner } from './InsightRunner';
export {
  budgetRiskDrafts,
  monthlyEquivalentCents,
  savingsRateDrafts,
  spendingAnomalyDraft,
  subscriptionAuditDrafts,
  upcomingRecurringDraft,
  type AnomalyInput,
  type InsightDraft,
  type RuleLike,
  type SavingsInput,
  type UpcomingInput,
} from './generators';
export {
  acknowledgeInsight,
  generateInsightsIfNeeded,
  listActiveInsights,
} from './repository';
export { useAcknowledgeInsight, useActiveInsights } from './hooks';
export { insightsCopy, insightsText } from './labels';
