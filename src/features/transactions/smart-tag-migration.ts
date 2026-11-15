import { count, eq, like } from 'drizzle-orm';
import { db } from '@/db/client';
import { transactions } from '@/db/schema';
import { getSetting, setSetting } from '@/db/settings';
import {
  LEGACY_SMART_NOTE_PREFIX,
  SMART_TAG,
  stripLegacySmartNotePrefix,
  withTag,
} from './tags';

/**
 * 旧版「智能识别」标记的升级迁移。
 *
 * 旧实现把出处写进备注（`【智能识别】午饭`），新实现用交易标签 `tags` 表示。
 * 升级后启动时由 SmartTagMigrationRunner 询问用户是否转换——存量数据是否愿意
 * 被改写属于用户的选择，所以这里只提供「检测 / 执行 / 记录决定」三件事，
 * 不自动迁移。
 */

/** 用户对本次迁移的决定：converted 已转换 / declined 明确不转换 / none 无历史数据 */
export type SmartTagMigrationDecision = 'converted' | 'declined' | 'none';

const DECISION_KEY = 'transactions.smartTagMigration.v1';

/** 备注匹配模式：前缀里不含 LIKE 通配符，无需转义 */
const LEGACY_NOTE_PATTERN = `%${LEGACY_SMART_NOTE_PREFIX}%`;

/** 用户已做出的决定；null = 尚未询问过 */
export function getSmartTagMigrationDecision(): Promise<SmartTagMigrationDecision | null> {
  return getSetting<SmartTagMigrationDecision>(DECISION_KEY);
}

export async function setSmartTagMigrationDecision(
  decision: SmartTagMigrationDecision,
): Promise<void> {
  await setSetting(DECISION_KEY, decision);
}

/** 备注里仍带着旧版「智能识别」前缀的交易数量 */
export async function countLegacySmartNoteTransactions(): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(transactions)
    .where(like(transactions.note, LEGACY_NOTE_PATTERN));
  return row?.value ?? 0;
}

/**
 * 把备注里的旧版标记转成交易标签：
 * - 备注只去掉「【智能识别】」前缀并清理首尾空白，其余文本一字不动；
 * - 标签保留既有标签并追加「智能」（已存在则不重复）。
 *
 * 幂等：重复执行不会重复追加标签，已转换的行也会被再次匹配到，
 * 因此中途失败后重新执行即可补齐。
 *
 * @returns 本次实际改写的交易数
 */
export async function migrateLegacySmartNotes(): Promise<number> {
  const rows = await db
    .select({ id: transactions.id, note: transactions.note, tags: transactions.tags })
    .from(transactions)
    .where(like(transactions.note, LEGACY_NOTE_PATTERN));

  const now = Date.now();
  for (const row of rows) {
    await db
      .update(transactions)
      .set({
        note: stripLegacySmartNotePrefix(row.note),
        tags: [...withTag(row.tags ?? [], SMART_TAG)],
        updatedAt: now,
      })
      .where(eq(transactions.id, row.id));
  }
  return rows.length;
}
