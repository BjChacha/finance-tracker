/**
 * 一句话记账的币种证据。
 *
 * 金额候选（money.ts）只负责人民币形状（元/块/角/毛/分），「2.99 刀」的数值会被
 * 解析成 299 分且币种信息丢失。这里独立扫描「紧邻数字的外币标记」，作为句子级
 * 证据交给业务校验层：标记必须与数字相邻（前后皆可），所以「买了把刀 30 元」里
 * 作名词的“刀”不会命中；「刀」只有直接跟在数字后才视作美元的口语说法。
 *
 * 返回值语义：null = 没有外币证据，或多种外币并存无法裁决（交给模型判断）；
 * 非 null = 全句唯一的外币代码（CNY 永远走默认，不需要证据）。
 */
/** 每个币种的可识别标记；顺序即提示词里的展示顺序 */
const MARKER_TABLE: readonly { code: string; markers: readonly string[] }[] = [
  {
    code: 'USD',
    markers: ['美元', '美刀', '美金', '美圆', 'US$', '＄', '$', '刀', 'USD'],
  },
  { code: 'EUR', markers: ['欧元', '欧', '€', 'EUR'] },
  { code: 'GBP', markers: ['英镑', '镑', '£', 'GBP'] },
  { code: 'JPY', markers: ['日元', '日圆', '円', 'JPY'] },
  { code: 'HKD', markers: ['港币', '港元', '港纸', 'HK$', 'HKD'] },
  { code: 'TWD', markers: ['新台币', '台币', 'NT$', 'TWD'] },
  { code: 'KRW', markers: ['韩元', '韩币', '₩', 'KRW'] },
  {
    code: 'SGD',
    markers: ['新加坡元', '新币', '新元', '坡币', 'S$', 'SGD'],
  },
  { code: 'AUD', markers: ['澳元', '澳币', 'A$', 'AUD'] },
  { code: 'CAD', markers: ['加元', '加币', 'C$', 'CAD'] },
];

const FOREIGN_CODES = MARKER_TABLE.map((row) => row.code);

/** 提示词里的币种清单（代码 + 口语标记提示），供请求组装复用 */
export const CURRENCY_HINTS: readonly string[] = MARKER_TABLE.map(
  ({ code, markers }) => `${code}(${markers.slice(0, 4).join('/')})`,
);

/** 币种白名单（含 CNY），与 lib/money 的符号表同源 */
export const SUPPORTED_TRANSACTION_CURRENCIES: readonly string[] = [
  'CNY',
  ...FOREIGN_CODES,
];

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// 与金额候选同一套数字字符：ASCII/全角数字、中文数字与十百千万，允许小数
const NUM =
  '[0-9\\uff10-\\uff19\\u96f6\\u3007\\u4e00\\u4e8c\\u4e24\\u4e09\\u56db\\u4e94\\u516d\\u4e03\\u516b\\u4e5d\\u5341\\u767e\\u5343\\u4e07]+(?:[.\\uff0e][0-9\\uff10-\\uff19]+)*';

// 长标记必须排在短标记前：HK$/US$ 要先于 $ 命中，新台币先于台币
const MARKER_TO_CODE = new Map<string, string>();
for (const { code, markers } of MARKER_TABLE) {
  for (const marker of markers) {
    const key = marker.toLowerCase();
    if (!MARKER_TO_CODE.has(key)) MARKER_TO_CODE.set(key, code);
  }
}
/** 只有符号/拉丁代码允许出现在数字前：中文词在数字前多是名词（两把刀30元） */
const PREFIX_ONLY = /^[A-Za-z$€£₩＄]+$/;

function alternation(keys: readonly string[]): string {
  return [...keys]
    .sort((a, b) => Array.from(b).length - Array.from(a).length)
    .map(escapeRegExp)
    .join('|');
}
const AFTER_ALTERNATION = alternation([...MARKER_TO_CODE.keys()]);
const BEFORE_ALTERNATION = alternation(
  [...MARKER_TO_CODE.keys()].filter((marker) => PREFIX_ONLY.test(marker)),
);

// 数字在前（2.99刀、100 美元）与符号在前（$2.99、HK$300）两种相邻方向
const MARKER_AFTER_NUMBER = new RegExp(
  `${NUM}\\s*(${AFTER_ALTERNATION})`,
  'giu',
);
const MARKER_BEFORE_NUMBER = new RegExp(
  `(${BEFORE_ALTERNATION})\\s*${NUM}`,
  'giu',
);

export function naturalLanguageCurrencyEvidence(text: string): string | null {
  const found = new Set<string>();
  for (const pattern of [MARKER_AFTER_NUMBER, MARKER_BEFORE_NUMBER]) {
    for (const match of text.matchAll(pattern)) {
      const code = MARKER_TO_CODE.get(match[1]!.toLowerCase());
      if (code) found.add(code);
    }
  }
  return found.size === 1 ? [...found][0]! : null;
}
