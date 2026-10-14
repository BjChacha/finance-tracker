import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { categories, settings, type TransactionType } from '@/db/schema';
import { zh } from '@/i18n/zh';
import { BUDGET_PERIODS, toPeriodKey } from '@/lib/date';
import { formatCents } from '@/lib/money';
import { budgetStatus, type BudgetStatusItem } from './repository';
import { crossedTier } from './transform';

// Expo Go（SDK 53+）移除了 expo-notifications 的推送能力，模块内任何原生访问都会抛错。
// storeClient = Expo Go；仅在 development/production build 中才真正启用通知。
const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

// 懒加载 expo-notifications：Expo Go 下根本不 require（避免原生访问在启动导入链中抛错，
// 进而拖垮 _layout → 全路由）。真实构建中首次调用时才加载，失败静默降级。
type NotificationsModule = typeof import('expo-notifications');
let notificationsModule: NotificationsModule | null | undefined;
function getNotifications(): NotificationsModule | null {
  if (isExpoGo) return null;
  if (notificationsModule !== undefined) return notificationsModule;
  try {
    notificationsModule = require('expo-notifications') as NotificationsModule;
  } catch {
    notificationsModule = null;
  }
  return notificationsModule;
}

/** settings 表防重复 key：同一预算同一周期同一档位只触发一次（periodKey 区分月/季/年） */
function alertKey(budgetId: string, periodKey: string, tier: number): string {
  return `budget-alert:${budgetId}:${periodKey}:${tier}`;
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
let handlerReady = false;

/**
 * 通知就绪：返回可用的 Notifications 模块（含权限+Android 渠道），不可用返回 null。
 * Expo Go 或任一步骤失败均静默降级（返回 null，不打断记账流程）。
 */
async function ensureNotificationsReady(): Promise<NotificationsModule | null> {
  const Notifications = getNotifications();
  if (!Notifications) return null;
  try {
    // 应用前台时也弹横幅（记完账立即可见）——首次调用时设一次
    if (!handlerReady) {
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: false,
          shouldSetBadge: false,
        }),
      });
      handlerReady = true;
    }
    let { granted } = await Notifications.getPermissionsAsync();
    if (!granted) {
      granted = (await Notifications.requestPermissionsAsync()).granted;
    }
    if (!granted) return null;
    if (Platform.OS === 'android' && !channelReady) {
      await Notifications.setNotificationChannelAsync('budget-alerts', {
        name: zh.budgets.notifWarnTitle,
        importance: Notifications.AndroidImportance.DEFAULT,
      });
      channelReady = true;
    }
    return Notifications;
  } catch {
    return null;
  }
}

async function notify(item: BudgetStatusItem, tier: number): Promise<void> {
  const Notifications = await ensureNotificationsReady();
  if (!Notifications) return;
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: tier === 100 ? zh.budgets.notifOverTitle : zh.budgets.notifWarnTitle,
        body: zh.budgets.notifBody(
          item.name,
          zh.budgets.periodScope[item.period],
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
 * 跨过 alertPct 或 100% 档位时发本地通知；同预算同周期同档位只触发一次（settings 记 key）。
 */
export async function checkBudgetsAfterTransaction(tx: BudgetCheckTx): Promise<void> {
  try {
    if (tx.type !== 'expense') return;
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

    // 交易同时落入月/季/年三个周期，分别检查各自预算
    for (const period of BUDGET_PERIODS) {
      const periodKey = toPeriodKey(tx.dateKey, period);
      const status = await budgetStatus(period, periodKey);
      const involved: BudgetStatusItem[] = [
        ...(status.total ? [status.total] : []),
        ...status.categories.filter((c) => c.categoryId === topCategoryId),
      ];
      for (const item of involved) {
        const tier = crossedTier(item.spent, item.amount, item.alertPct);
        if (tier === null) continue;
        const key = alertKey(item.budgetId, periodKey, tier);
        if (await hasFired(key)) continue;
        // 先记档再发通知：即使权限被拒也视为已处理，保证「只触发一次」
        await markFired(key);
        await notify(item, tier);
      }
    }
  } catch {
    // 提醒失败不影响主流程
  }
}
