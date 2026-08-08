import Papa from 'papaparse';
import { dayjs } from '@/lib/date';
import { parseMoneyToCents, parseRateToScaled, RATE_SCALE } from '@/lib/money';
import type {
  ImportAdapter,
  NormalizedTransaction,
  ParseIssue,
  ParseResult,
} from '../core/types';

/**
 * 薄荷记账导出适配器。
 *
 * 导出格式：UTF-16 LE + Tab 分隔，19 列，中文表头。按表头名取列（抗列序变动）。
 * 多币种：薄荷按「交易」记币种（一张 CNY 卡上可能出现 JPY 消费），较随意。
 * 本适配器先以「收支交易」对每个账户投票出该账户的主币种，再把每笔交易折算到
 * 其账户主币种（同币种不动；跨币种按各行自带汇率折算），保证账户余额币种一致。
 * 单边转账（无收款方）按需求跳过并记 warning。
 */

/** 薄荷表头集合（detect 用） */
const HEADER_NEED = ['类型', '货币', '金额', '汇率', '分类', '父类', '账户', '付款', '收款', '日期', '备注'];

/** 把已折算/原币金额按汇率换算到目标币种（分）。汇率均为 ×1e6 相对 CNY。 */
function convertCents(amount: number, fromRate: number, toRate: number): number {
  return Math.round((amount * fromRate) / toRate);
}

/** 计算交易某一侧（源/目标）在该侧账户币种下的金额与该币种汇率 */
function convertSide(
  rawAmount: number,
  rawCur: string,
  rawRate: number,
  targetCur: string,
  targetRate: number,
): { amount: number; rate: number; converted: boolean } {
  if (rawCur === targetCur) return { amount: rawAmount, rate: rawRate, converted: false };
  return { amount: convertCents(rawAmount, rawRate, targetRate), rate: targetRate, converted: true };
}

/** 组装备注：备注 + @商家 + #项目 */
function buildNote(note: string, merchant: string, project: string, extra?: string): string {
  let s = note.trim();
  if (merchant) s += `${s ? ' @' : '@'}${merchant}`;
  if (project) s += `${s ? ' #' : '#'}${project}`;
  if (extra) s += `${s ? ' ' : ''}${extra}`;
  return s;
}

export const boheCsvAdapter: ImportAdapter = {
  id: 'bohe-csv',
  displayName: '薄荷记账',
  fileExtensions: ['.csv'],

  async detect(ctx) {
    if (!ctx.fileName.toLowerCase().endsWith('.csv')) return { confidence: 0 };
    const lines = await ctx.readHead(2);
    const header = lines[0] ?? '';
    const fields = header.split('\t').map((f) => f.trim());
    const hit = HEADER_NEED.filter((h) => fields.some((f) => f === h || (h === '汇率' && f.startsWith('汇率')))).length;
    if (hit >= 9) return { confidence: 0.9, reason: '薄荷记账导出' };
    return { confidence: 0 };
  },

  async parse(ctx): Promise<ParseResult> {
    const text = await ctx.readText();
    const parsed = Papa.parse<Record<string, string>>(text, {
      delimiter: '\t',
      header: true,
      skipEmptyLines: 'greedy',
      transformHeader: (h) => h.trim(),
    });
    const fields = parsed.meta.fields ?? [];
    const find = (candidates: string[], prefix?: string) =>
      fields.find((f) => candidates.includes(f) || (prefix != null && f.startsWith(prefix)));
    const h = {
      type: find(['类型']),
      currency: find(['货币', '币种']),
      amount: find(['金额']),
      rate: find([], '汇率'),
      project: find(['项目']),
      category: find(['分类']),
      parent: find(['父类']),
      account: find(['账户']),
      from: find(['付款']),
      to: find(['收款']),
      merchant: find(['商家']),
      date: find(['日期', '时间']),
      note: find(['备注']),
    };
    const cell = (row: Record<string, string>, key: string | undefined): string =>
      key ? (row[key] ?? '').trim() : '';

    const issues: ParseIssue[] = [];
    const transactions: NormalizedTransaction[] = [];

    // ---- 第一遍：投票各账户主币种 + 收集各币种汇率 ----
    const currencyVotes = new Map<string, Map<string, number>>();
    const rateByCurrency = new Map<string, number>();
    for (const row of parsed.data) {
      const type = cell(row, h.type);
      const cur = cell(row, h.currency).toUpperCase() || 'CNY';
      const rate = parseRateToScaled(cell(row, h.rate));
      if (!rateByCurrency.has(cur)) rateByCurrency.set(cur, rate);
      else rateByCurrency.set(cur, rate); // 后写覆盖：汇率随时间变动，取较新值
      if (type === '支出' || type === '收入') {
        const acc = cell(row, h.account);
        if (acc) {
          let perAcct = currencyVotes.get(acc);
          if (!perAcct) currencyVotes.set(acc, (perAcct = new Map()));
          perAcct.set(cur, (perAcct.get(cur) ?? 0) + 1);
        }
      }
    }
    const accountCurrency = new Map<string, string>();
    const accountRate = new Map<string, number>();
    for (const [acc, votes] of currencyVotes) {
      let bestCur = 'CNY';
      let bestCnt = -1;
      for (const [cur, cnt] of votes) {
        if (cnt > bestCnt || (cnt === bestCnt && cur === 'CNY')) {
          bestCur = cur;
          bestCnt = cnt;
        }
      }
      accountCurrency.set(acc, bestCur);
      accountRate.set(acc, bestCur === 'CNY' ? RATE_SCALE : (rateByCurrency.get(bestCur) ?? RATE_SCALE));
    }
    const curOf = (label: string) => accountCurrency.get(label) ?? 'CNY';
    const rateOf = (label: string) => accountRate.get(label) ?? RATE_SCALE;

    // ---- 第二遍：逐行生成标准化交易 ----
    parsed.data.forEach((row, i) => {
      const rowNo = i + 2; // 表头占第 1 行

      const typeRaw = cell(row, h.type);
      const dateRaw = cell(row, h.date);
      const d = dayjs(dateRaw);
      if (!d.isValid()) {
        issues.push({ row: rowNo, message: `第 ${rowNo} 行：日期无法识别（${dateRaw || '空'}）`, severity: 'error' });
        return;
      }
      const date = d.format('YYYY-MM-DD HH:mm');

      const amountCell = cell(row, h.amount);
      const parsedCents = parseMoneyToCents(amountCell);
      if (parsedCents === null) {
        issues.push({ row: rowNo, message: `第 ${rowNo} 行：金额无法识别（${amountCell || '空'}）`, severity: 'error' });
        return;
      }
      const rawAmount = Math.abs(parsedCents);
      if (rawAmount === 0) {
        issues.push({ row: rowNo, message: `第 ${rowNo} 行：金额为 0，已跳过`, severity: 'warning' });
        return;
      }

      const rawCur = cell(row, h.currency).toUpperCase() || 'CNY';
      const rawRate = parseRateToScaled(cell(row, h.rate));
      const note = cell(row, h.note);
      const merchant = cell(row, h.merchant);
      const project = cell(row, h.project);
      const category = cell(row, h.category);
      const parent = cell(row, h.parent);

      let direction: NormalizedTransaction['direction'] | null = null;
      if (typeRaw === '支出') direction = 'expense';
      else if (typeRaw === '收入') direction = 'income';
      else if (typeRaw === '转账') direction = 'transfer';
      if (!direction) {
        issues.push({ row: rowNo, message: `第 ${rowNo} 行：未知类型「${typeRaw}」`, severity: 'error' });
        return;
      }

      if (direction === 'transfer') {
        const srcLabel = cell(row, h.from);
        const dstLabel = cell(row, h.to);
        if (!srcLabel && !dstLabel) {
          issues.push({ row: rowNo, message: `第 ${rowNo} 行：转账缺少付款/收款账户，已跳过`, severity: 'warning' });
          return;
        }
        if (!dstLabel || !srcLabel) {
          // 单边转账（用户决策：跳过）
          issues.push({
            row: rowNo,
            message: `第 ${rowNo} 行：单边转账（${cell(row, h.category) || '转账'}）缺少${dstLabel ? '付款' : '收款'}方，已跳过`,
            severity: 'warning',
          });
          return;
        }
        const srcCur = curOf(srcLabel);
        const dstCur = curOf(dstLabel);
        const src = convertSide(rawAmount, rawCur, rawRate, srcCur, rateOf(srcLabel));
        const dst = convertSide(rawAmount, rawCur, rawRate, dstCur, rateOf(dstLabel));
        const transferCat = cell(row, h.category); // 转账原因（如「信用卡还款」），折叠进备注
        transactions.push({
          direction: 'transfer',
          amountCents: src.amount,
          date,
          currency: srcCur,
          exchangeRate: src.rate,
          toAmountCents: dst.amount,
          toCurrency: dstCur,
          toExchangeRate: dst.rate,
          rawAccount: srcLabel,
          rawToAccount: dstLabel,
          note: buildNote(note, merchant, project, transferCat ? `#${transferCat}` : undefined),
        });
        return;
      }

      // expense / income
      // 薄荷部分行（如「投资亏损」）未填账户；归入可映射的兜底账户，避免丢数据。
      const accLabel = cell(row, h.account) || '未指定账户';
      const accCur = curOf(accLabel);
      const side = convertSide(rawAmount, rawCur, rawRate, accCur, rateOf(accLabel));
      const extra = side.converted ? `[原币 ${amountCell} ${rawCur} @ ${cell(row, h.rate) || '1'}]` : undefined;
      transactions.push({
        direction,
        amountCents: side.amount,
        date,
        currency: accCur,
        exchangeRate: side.rate,
        rawAccount: accLabel,
        rawCategory: parent ? `${parent}/${category}` : category || undefined,
        note: buildNote(note, merchant, project, extra),
      });
    });

    for (const err of parsed.errors) {
      issues.push({
        row: (err.row ?? 0) + 2,
        message: `解析警告：${err.message}`,
        severity: 'warning',
      });
    }

    const dates = transactions.map((t) => t.date.slice(0, 10)).sort();
    return {
      transactions,
      issues,
      meta: {
        sourceAppName: '薄荷记账',
        dateRange: dates.length > 0 ? [dates[0]!, dates[dates.length - 1]!] : undefined,
      },
    };
  },
};
