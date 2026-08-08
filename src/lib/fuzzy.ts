/**
 * 简易模糊匹配：query 按空白拆 token、统一小写；target 须同时包含全部 token。
 * 中文子串（如「餐」命中「餐饮」）天然可用；空 query 视为命中（展示全部）。
 */
export function matchText(query: string, target: string): boolean {
  const q = query.trim().toLowerCase();
  if (q === '') return true;
  const t = target.toLowerCase();
  return q.split(/\s+/).every((tok) => t.includes(tok));
}
