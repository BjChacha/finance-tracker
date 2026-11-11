import type { InsightType } from '@/db/schema';

/** 洞察文案：标题 + 一行正文模板。数字由生成器拼入，零 LLM。 */
export const insightsText: Record<InsightType, { title: string; icon: string }> = {
  budget_risk: { title: '预算提醒', icon: 'target' },
  spending_anomaly: { title: '大额支出提醒', icon: 'chart-pie' },
  subscription_audit: { title: '订阅盘点', icon: 'repeat' },
  savings_rate_change: { title: '储蓄率变化', icon: 'coins' },
  upcoming_recurring: { title: '即将扣款', icon: 'calendar' },
};

export const insightsCopy = {
  ack: '知道了',
  budgetWarn: (name: string, pct: number, remaining: string) =>
    `${name}已用 ${pct}%，剩余 ${remaining}`,
  budgetOver: (name: string, pct: number, over: string) =>
    `${name}已超支 ${over}（用了 ${pct}%）`,
  anomaly: (note: string, amount: string, multiple: number) =>
    `${note} ${amount}，约为该分类日常的 ${multiple} 倍`,
  subscription: (monthly: string, count: number) =>
    `${count} 项周期支出折算每月约 ${monthly}`,
  savingsUp: (rate: number, delta: number) =>
    `本月储蓄率 ${rate}%，较前三月均值高 ${delta} 个百分点`,
  savingsDown: (rate: number, delta: number) =>
    `本月储蓄率 ${rate}%，较前三月均值低 ${delta} 个百分点`,
  upcoming: (count: number, total: string, needConfirm: number) =>
    `未来 3 天有 ${count} 笔周期记账共 ${total}${needConfirm > 0 ? `，其中 ${needConfirm} 笔待确认` : ''}`,
} as const;
