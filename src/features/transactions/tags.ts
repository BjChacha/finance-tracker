/**
 * 交易标签。
 *
 * 标签是交易实体的一个属性（`transactions.tags`，JSON 数组，见 src/db/schema.ts），
 * 用来标注交易的来源/性质，而不是把标记混进备注文本。
 * 约定：单个标签是最多两个字的短词，只做标记用，不承载长文本（如「智能」）。
 */

/** 单个标签的最大字数（按码点计） */
export const MAX_TAG_CHARS = 2;

/** 一句话智能识别生成的交易携带的标签 */
export const SMART_TAG = '智能';

/**
 * 旧版实现把智能识别标记写成备注前缀（`【智能识别】午饭`）。
 * 该常量只服务于升级迁移：识别历史数据并把前缀转成 {@link SMART_TAG} 标签。
 */
export const LEGACY_SMART_NOTE_PREFIX = '【智能识别】';

/** 标签是否合规：去空白后非空且不超过 {@link MAX_TAG_CHARS} 个字 */
export function isValidTag(tag: string): boolean {
  const length = Array.from(tag.trim()).length;
  return length > 0 && length <= MAX_TAG_CHARS;
}

/**
 * 写入边界上的标签归一化：去空白、超长截断、去重（保持入参顺序）。
 * 应用写入与备份恢复都经此收敛，保证库里的标签始终合规。
 */
export function sanitizeTags(tags: readonly string[] | null | undefined): string[] {
  const result: string[] = [];
  for (const raw of tags ?? []) {
    const tag = Array.from(raw.trim()).slice(0, MAX_TAG_CHARS).join('');
    if (tag && !result.includes(tag)) result.push(tag);
  }
  return result;
}

/** 追加一个标签（已存在时原样返回，保证引用稳定） */
export function withTag(tags: readonly string[], tag: string): readonly string[] {
  return tags.includes(tag) ? tags : [...tags, tag];
}

/**
 * 去掉旧版备注里的智能识别前缀并清理首尾空白；
 * 前缀独占备注时得到空串（迁移后该交易的备注即为空）。
 */
export function stripLegacySmartNotePrefix(note: string): string {
  return note.split(LEGACY_SMART_NOTE_PREFIX).join('').trim();
}
