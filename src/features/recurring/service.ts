import { and, eq, lte } from 'drizzle-orm';
import { db, withTransaction } from '@/db/client';
import { recurringRules, transactions } from '@/db/schema';
import { todayKey } from '@/lib/date';
import { hasRunTransaction, ruleToTxValues } from './repository';
import { advanceRule, generateRunDates } from './transform';

export type CatchUpResult = {
  /** 本次自动补建的交易笔数 */
  created: number;
  /** 待确认（autoCreate=0 已到期）规则数 */
  pending: number;
};

/**
 * 周期记账补账执行器（启动 / 回前台调用）：
 * - autoCreate=1：从 nextRunDate 循环补建交易直到今天（endDate 截断），单事务；
 *   幂等：同规则同 dateKey 已存在则跳过，重复调用不重复生成
 * - autoCreate=0：不生成，计入 pending（UI 展示待确认列表，用户"记入/跳过"推进）
 * - endDate 已过期的规则自动停用（enabled=0）
 */
export async function catchUp(): Promise<CatchUpResult> {
  const today = todayKey();
  const due = await db
    .select()
    .from(recurringRules)
    .where(and(eq(recurringRules.enabled, 1), lte(recurringRules.nextRunDate, today)));
  if (due.length === 0) return { created: 0, pending: 0 };

  let created = 0;
  let pending = 0;
  await withTransaction(async () => {
    for (const rule of due) {
      const dates = generateRunDates(rule, today);
      const { nextRun, expired } = advanceRule(rule, today);

      if (rule.autoCreate !== 1) {
        if (dates.length > 0) {
          // 仍有可确认的期数，保留在待确认列表
          pending++;
        } else if (expired) {
          // nextRunDate 已越过 endDate，整条规则过期停用
          await db
            .update(recurringRules)
            .set({ enabled: 0, updatedAt: Date.now() })
            .where(eq(recurringRules.id, rule.id));
        }
        continue;
      }

      let last: string | null = null;
      for (const dateKey of dates) {
        if (!(await hasRunTransaction(rule.id, dateKey))) {
          await db.insert(transactions).values(ruleToTxValues(rule, dateKey));
          created++;
        }
        last = dateKey;
      }
      await db
        .update(recurringRules)
        .set({
          nextRunDate: nextRun,
          lastRunDate: last ?? rule.lastRunDate,
          enabled: expired ? 0 : 1,
          updatedAt: Date.now(),
        })
        .where(eq(recurringRules.id, rule.id));
    }
  });
  return { created, pending };
}

/** 节流：同一天只跑一次（模块级变量，应用重启后自然重置） */
let lastRunDay: string | null = null;

/** 启动 / AppState 回到 active 时的节流入口；失败静默（下次仍可重试） */
export async function runCatchUpIfNeeded(): Promise<CatchUpResult | null> {
  const today = todayKey();
  if (lastRunDay === today) return null;
  lastRunDay = today;
  try {
    return await catchUp();
  } catch (e) {
    lastRunDay = null; // 允许下次重试
    console.warn('[recurring] catchUp failed:', e);
    return null;
  }
}
