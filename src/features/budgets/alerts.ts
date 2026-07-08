import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { categories, settings, type TransactionType } from '@/db/schema';
import { zh } from '@/i18n/zh';
import { toMonthKey } from '@/lib/date';
import { formatCents } from '@/lib/money';
import { budgetStatus, type BudgetStatusItem } from './repository';
import { crossedTier } from './transform';

// 应用前台时也弹横幅（记完账立即可见）
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

/** settings 表防重复 key：同一预算同一月同一档位只触发一次 */
function alertKey(budgetId: string, monthKey: string, tier: number): string {
  return `budget-alert:${budgetId}:${monthKey}:${tier}`;
}

async function hasFired(key: string): Promise<boolean> {
  const rows = await db.select({ key: settings.key }).from(settings).where(eq(settings.key, key)).limit(1);
  return rows.length > 0;
}

async function markFired(key: string): Promise<void> {
  await db
    .insert(settings)
    .values({ key, value: JSON.stringify(Date.now()) })
    .onConflictDoNothing();
}

let channelReady = false;

/** 通知权限 + Android 通知渠道就绪；任一失败静默降级（返回 false，不打断记账流程） */
async function ensureNotificationsReady(): Promise<boolean> {
  try {
    let { granted } = await Notifications.getPermissionsAsync();
    if (!granted) {
      granted = (await Notifications.requestPermissionsAsync()).granted;
    }
    if (!granted) return false;
    if (Platform.OS === 'android' && !channelReady) {
      await Notifications.setNotificationChannelAsync('budget-alerts', {
        name: zh.budgets.notifWarnTitle,
        importance: Notifications.AndroidImportance.DEFAULT,
      });
      channelReady = true;
    }
    return true;
  } catch {
    return false;
  }
}

async function notify(item: BudgetStatusItem, tier: number): Promise<void> {
  const ok = await ensureNotificationsReady();
  if (!ok) return;
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: tier === 100 ? zh.budgets.notifOverTitle : zh.budgets.notifWarnTitle,
        body: zh.budgets.notifBody(
          item.name,
          String(item.pct),
          formatCents(item.spent),
          formatCents(item.amount),
        ),
      },
      trigger: null, // 立即触发
    });
  } catch {
    // 静默降级：通知失败不影响记账
  }
}

export type BudgetCheckTx = {
  type: TransactionType;
  categoryId: string | null;
  /** 'YYYY-MM-DD' */
  dateKey: string;
};

/**
 * 记账后预算提醒检查（仅 expense）：
 * 检查该笔交易涉及的分类预算（子分类归并到父分类）与总预算，
 * 跨过 alertPct 或 100% 档位时发本地通知；同预算同月同档位只触发一次（settings 记 key）。
 */
export async function checkBudgetsAfterTransaction(tx: BudgetCheckTx): Promise<void> {
  try {
    if (tx.type !== 'expense') return;
    const monthKey = toMonthKey(tx.dateKey);
    const status = await budgetStatus(monthKey);

    // 子分类消费归并计入父分类预算：找到所属一级分类
    let topCategoryId = tx.categoryId;
    if (topCategoryId) {
      const [cat] = await db
        .select({ parentId: categories.parentId })
        .from(categories)
        .where(eq(categories.id, topCategoryId))
        .limit(1);
      if (cat?.parentId) topCategoryId = cat.parentId;
    }

    const involved: BudgetStatusItem[] = [
      ...(status.total ? [status.total] : []),
      ...status.categories.filter((c) => c.categoryId === topCategoryId),
    ];
    for (const item of involved) {
      const tier = crossedTier(item.spent, item.amount, item.alertPct);
      if (tier === null) continue;
      const key = alertKey(item.budgetId, monthKey, tier);
      if (await hasFired(key)) continue;
      // 先记档再发通知：即使权限被拒也视为已处理，保证"只触发一次"
      await markFired(key);
      await notify(item, tier);
    }
  } catch {
    // 提醒失败不影响主流程
  }
}
