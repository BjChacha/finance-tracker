/**
 * 汇率表：相对本位币（CNY）的各币种汇率。
 *
 * 存储：settings 表一个 JSON key {@link RATES_KEY}，存 `{ fetchedAt, rates }`。
 * settings 已随备份全量导出，shape 不变 → 无需迁移/改备份。
 *
 * 来源：{@link fetchLiveRates} 按国内优先（新浪 → 腾讯）顺序在线拉取，境外 open.er-api 作末位兜底；
 * 全部失败抛错，调用方保留旧缓存。离线首启用 {@link DEFAULT_RATES}，保证表单永远拿得到汇率。
 */
import { getSetting, getSettingSync, setSetting } from '@/db/settings';
import { CURRENCY_SYMBOLS } from '@/lib/money';

/** settings key：值形状为 RatesCache（JSON 字符串） */
export const RATES_KEY = 'rates';

/** 缓存判定为陈旧的阈值：24h（mount/回前台时超过则后台刷新） */
export const STALE_MS = 24 * 60 * 60 * 1000;

/** 离线/未拉取时的内置兜底汇率（rateToCNY，近似值，仅 fallback） */
export const DEFAULT_RATES: Record<string, number> = {
  USD: 7.2,
  EUR: 7.8,
  GBP: 9.1,
  JPY: 0.048,
  HKD: 0.92,
  TWD: 0.22,
  KRW: 0.0053,
  SGD: 5.35,
  AUD: 4.75,
  CAD: 5.25,
};

/** 支持的币种（含本位币 CNY），由符号表派生 */
export const SUPPORTED_CURRENCIES: readonly string[] = Object.keys(CURRENCY_SYMBOLS);

export type RatesCache = { fetchedAt: number | null; rates: Record<string, number> };

/** 同步读取汇率缓存；rates 与 DEFAULT_RATES 合并，保证每币种都有值。 */
export function getRatesSync(): RatesCache {
  const cached = getSettingSync<RatesCache>(RATES_KEY);
  if (!cached) return { fetchedAt: null, rates: { ...DEFAULT_RATES } };
  return {
    fetchedAt: cached.fetchedAt ?? null,
    rates: { ...DEFAULT_RATES, ...cached.rates },
  };
}

/** 异步读取汇率缓存（合并默认值）。 */
export async function getRates(): Promise<RatesCache> {
  const cached = await getSetting<RatesCache>(RATES_KEY);
  if (!cached) return { fetchedAt: null, rates: { ...DEFAULT_RATES } };
  return {
    fetchedAt: cached.fetchedAt ?? null,
    rates: { ...DEFAULT_RATES, ...cached.rates },
  };
}

/** 缓存是否需要刷新：从未拉取或超过 STALE_MS。 */
export function isStale(cache: Pick<RatesCache, 'fetchedAt'> | null): boolean {
  if (!cache || cache.fetchedAt == null) return true;
  return Date.now() - cache.fetchedAt > STALE_MS;
}

/* ----------------------------- 在线汇率源（国内优先） -----------------------------
 * fetchLiveRates 是单点 adapter：新浪 → 腾讯 → open.er-api。任一源成功即返回
 * 规整后的 rateToCNY（1 外币 = N CNY）；全部失败抛错。日后换源（如 CFETS 中间价）只改这里。
 *
 * 注意：新浪/腾讯返回的是文本，字段索引与单位（多为 人民币/100 外币）按其常见布局实现；
 * 如响应字段变更，按实测调整各 parseXxx，或在无效时让其抛错以回落下一源。
 */

/** 新浪外汇牌价：值为"人民币/100 外币"，需 ÷100。 */
const SINA_LIST = [
  'USDCNY',
  'EURCNY',
  '100JPYCNY',
  'HKDCNY',
  'GBPCNY',
  'AUDCNY',
  'CADCNY',
  'SGDCNY',
  '100KRWCNY',
  'TWDCNY',
] as const;
const SINA_CODE_TO_ISO: Record<string, string> = {
  USDCNY: 'USD',
  EURCNY: 'EUR',
  '100JPYCNY': 'JPY',
  HKDCNY: 'HKD',
  GBPCNY: 'GBP',
  AUDCNY: 'AUD',
  CADCNY: 'CAD',
  SGDCNY: 'SGD',
  '100KRWCNY': 'KRW',
  TWDCNY: 'TWD',
};
const SINA_URL = `https://hq.sinajs.cn/list=${SINA_LIST.join(',')}`;
// 字段索引（新浪外汇牌价常见布局）：1=现汇买入价,3=现汇卖出价,5=中行折算价(中间价)
const SINA_BUY = 1;
const SINA_SELL = 3;
const SINA_MID = 5;

function parseSina(text: string): Record<string, number> {
  const out: Record<string, number> = {};
  const re = /var hq_str_(\w+)="([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const iso = SINA_CODE_TO_ISO[m[1]];
    if (!iso) continue;
    const f = m[2].split(',');
    const mid = num(f[SINA_MID]) ?? avg(num(f[SINA_BUY]), num(f[SINA_SELL]));
    if (mid == null || mid <= 0) continue;
    out[iso] = mid / 100; // 人民币/100 外币 → 人民币/1 外币
  }
  return out;
}

/** 腾讯财经外汇（qt.gtimg.cn，无 Referer 要求）；取前两个数值的中间作为现汇中间价。 */
const TENCENT_LIST = [
  'fx_susdcny',
  'fx_seurcny',
  'fx_s100jpycny',
  'fx_shkdcny',
  'fx_sgbpcny',
  'fx_saudcny',
  'fx_scadcny',
  'fx_ssgdcny',
  'fx_skrwcny',
  'fx_stwdcny',
] as const;
const TENCENT_CODE_TO_ISO: Record<string, string> = {
  fx_susdcny: 'USD',
  fx_seurcny: 'EUR',
  fx_s100jpycny: 'JPY',
  fx_shkdcny: 'HKD',
  fx_sgbpcny: 'GBP',
  fx_saudcny: 'AUD',
  fx_scadcny: 'CAD',
  fx_ssgdcny: 'SGD',
  fx_skrwcny: 'KRW',
  fx_stwdcny: 'TWD',
};
const TENCENT_URL = `https://qt.gtimg.cn/q=${TENCENT_LIST.join(',')}`;

function parseTencent(text: string): Record<string, number> {
  // qq fx_s 响应：v_fx_susdcny="现汇买入价,现汇卖出价,..."; 不同品种字段数略有差异，
  // 取前两个正值的中点。JPY/KRW 的 fx_s 视作 per-1 报价，不再 ÷100（若实测为 per-100，在此 /100）。
  const out: Record<string, number> = {};
  const re = /v_(fx_s\w+?)="([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const iso = TENCENT_CODE_TO_ISO[m[1]];
    if (!iso) continue;
    const nums = m[2]
      .split(',')
      .map(num)
      .filter((x): x is number => x != null);
    if (nums.length < 2) continue;
    const mid = (nums[0] + nums[1]) / 2;
    if (mid <= 0) continue;
    out[iso] = mid;
  }
  return out;
}

/** open.er-api（境外，JSON，末位兜底）：rates[code] = 外币/1CNY，取倒数得 CNY/1外币。 */
const ERAPI_URL = 'https://open.er-api.com/v6/latest/CNY';

function parseErApi(json: unknown): Record<string, number> {
  const r = (json ?? {}) as { rates?: Record<string, unknown> };
  if (!r.rates) throw new Error('er-api: no rates');
  const out: Record<string, number> = {};
  for (const iso of SUPPORTED_CURRENCIES) {
    if (iso === 'CNY') continue;
    const v = r.rates[iso];
    if (typeof v === 'number' && v > 0) out[iso] = 1 / v;
  }
  return out;
}

/** 顺序尝试各源，返回 rateToCNY 映射；任一源成功即返回。全部失败抛错。 */
export async function fetchLiveRates(): Promise<Record<string, number>> {
  const tried: string[] = [];

  // 1) 新浪（国内）
  try {
    const res = await fetch(SINA_URL, { headers: { Referer: 'https://finance.sina.com.cn/' } });
    if (res.ok) {
      const rates = parseSina(await res.text());
      if (Object.keys(rates).length > 0) return rates;
    } else {
      tried.push(`sina:${res.status}`);
    }
  } catch {
    tried.push('sina:err');
  }

  // 2) 腾讯（国内）
  try {
    const res = await fetch(TENCENT_URL);
    if (res.ok) {
      const rates = parseTencent(await res.text());
      if (Object.keys(rates).length > 0) return rates;
    } else {
      tried.push(`tencent:${res.status}`);
    }
  } catch {
    tried.push('tencent:err');
  }

  // 3) open.er-api（境外兜底）
  try {
    const res = await fetch(ERAPI_URL);
    if (res.ok) {
      const rates = parseErApi(await res.json());
      if (Object.keys(rates).length > 0) return rates;
    } else {
      tried.push(`er-api:${res.status}`);
    }
  } catch {
    tried.push('er-api:err');
  }

  throw new Error(`所有汇率源均失败 (${tried.join(', ')})`);
}

/** 拉取最新汇率并写入缓存；失败抛错（调用方吞掉，不覆盖旧缓存）。 */
export async function refreshRates(): Promise<void> {
  const live = await fetchLiveRates();
  const rates: Record<string, number> = {};
  for (const iso of SUPPORTED_CURRENCIES) {
    if (iso === 'CNY') continue;
    const v = live[iso];
    if (typeof v === 'number' && v > 0) rates[iso] = v;
  }
  await setSetting(RATES_KEY, { fetchedAt: Date.now(), rates });
}

/* 私有小工具 */
function num(s: string | undefined): number | null {
  if (s == null) return null;
  const n = Number(s.trim());
  return Number.isFinite(n) && n > 0 ? n : null;
}
function avg(a: number | null, b: number | null): number | null {
  if (a == null || b == null) return null;
  return (a + b) / 2;
}
