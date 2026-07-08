import Papa from 'papaparse';
import { z } from 'zod';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import { dayjs } from '@/lib/date';
import { parseMoneyToCents } from '@/lib/money';
import type {
  ImportAdapter,
  ImportFileContext,
  NormalizedTransaction,
  ParseIssue,
} from '../core/types';

dayjs.extend(customParseFormat);

/**
 * 通用 CSV 适配器：兜底方案，用户在向导中手动完成列映射。
 * detect 恒为低置信度 0.2，任何专用适配器都能覆盖它。
 */

/** 列映射配置（向导"列映射"步骤生成） */
export const genericCsvConfigSchema = z.object({
  /** 日期列表头 */
  dateColumn: z.string().min(1),
  /** 金额列表头 */
  amountColumn: z.string().min(1),
  /**
   * 收支方向判定方式：
   * - 'sign'：按金额正负号（负数=支出，正数=收入）
   * - 'column'：按单独一列的文案判定（配合 directionColumn + 各标签）
   */
  directionMode: z.enum(['sign', 'column']),
  /** directionMode='column' 时的方向列表头 */
  directionColumn: z.string().optional(),
  /** 方向列中视为"收入"的文案（默认 ['收入']；其余按支出处理） */
  incomeLabels: z.array(z.string()).optional(),
  /** 方向列中视为"转账"的文案（可选，如 ['转账']） */
  transferLabels: z.array(z.string()).optional(),
  /** 分类列（可选，不选则导入后统一映射） */
  categoryColumn: z.string().optional(),
  /** 账户列（可选） */
  accountColumn: z.string().optional(),
  /** 转入账户列（可选，转账行使用） */
  toAccountColumn: z.string().optional(),
  /** 备注列（可选） */
  noteColumn: z.string().optional(),
  /** 日期格式（可选，如 'YYYY-MM-DD'；不填自动识别常见格式） */
  dateFormat: z.string().optional(),
});

export type GenericCsvConfig = z.infer<typeof genericCsvConfigSchema>;

/** 解析日期：优先用户指定格式（严格），否则 dayjs 自动识别 */
function parseDate(value: string, dateFormat?: string): string | null {
  const s = value.trim();
  if (!s) return null;
  const d = dateFormat ? dayjs(s, dateFormat, true) : dayjs(s);
  if (!d.isValid()) return null;
  return d.format('YYYY-MM-DD HH:mm:ss');
}

function cell(row: Record<string, string>, column: string | undefined): string {
  if (!column) return '';
  return (row[column] ?? '').trim();
}

export const genericCsvAdapter: ImportAdapter = {
  id: 'generic-csv',
  displayName: '通用 CSV',
  fileExtensions: ['.csv'],
  configSchema: genericCsvConfigSchema,

  async detect(ctx) {
    if (!ctx.fileName.toLowerCase().endsWith('.csv')) return { confidence: 0 };
    return { confidence: 0.2, reason: '通用 CSV（手动列映射）' };
  },

  async parse(ctx, config) {
    const cfg = genericCsvConfigSchema.parse(config);
    const text = await ctx.readText();
    const parsed = Papa.parse<Record<string, string>>(text, {
      header: true,
      skipEmptyLines: 'greedy',
      transformHeader: (h) => h.trim(),
    });

    const issues: ParseIssue[] = [];
    const transactions: NormalizedTransaction[] = [];
    const incomeLabels = (cfg.incomeLabels ?? ['收入']).map((l) => l.trim()).filter(Boolean);
    const transferLabels = (cfg.transferLabels ?? []).map((l) => l.trim()).filter(Boolean);

    parsed.data.forEach((row, i) => {
      // 源文件行号：表头占第 1 行，数据从第 2 行起
      const rowNo = i + 2;

      const date = parseDate(cell(row, cfg.dateColumn), cfg.dateFormat);
      if (!date) {
        issues.push({ row: rowNo, message: `第 ${rowNo} 行：日期无法识别`, severity: 'error' });
        return;
      }

      const rawAmount = cell(row, cfg.amountColumn);
      const cents = parseMoneyToCents(rawAmount);
      if (cents === null) {
        issues.push({
          row: rowNo,
          message: `第 ${rowNo} 行：金额无法识别（${rawAmount || '空'}）`,
          severity: 'error',
        });
        return;
      }
      if (cents === 0) {
        issues.push({ row: rowNo, message: `第 ${rowNo} 行：金额为 0，已跳过`, severity: 'error' });
        return;
      }

      let direction: NormalizedTransaction['direction'];
      if (cfg.directionMode === 'sign') {
        direction = cents < 0 ? 'expense' : 'income';
      } else {
        const label = cell(row, cfg.directionColumn);
        if (transferLabels.includes(label)) direction = 'transfer';
        else if (incomeLabels.includes(label)) direction = 'income';
        else direction = 'expense';
      }

      transactions.push({
        direction,
        amountCents: Math.abs(cents),
        date,
        note: cell(row, cfg.noteColumn) || undefined,
        rawCategory: cell(row, cfg.categoryColumn) || undefined,
        rawAccount: cell(row, cfg.accountColumn) || undefined,
        rawToAccount: cell(row, cfg.toAccountColumn) || undefined,
        raw: row,
      });
    });

    for (const err of parsed.errors) {
      issues.push({
        row: (err.row ?? 0) + 2,
        message: `CSV 解析警告：${err.message}`,
        severity: 'warning',
      });
    }

    const dates = transactions.map((t) => t.date.slice(0, 10)).sort();
    return {
      transactions,
      issues,
      meta: {
        dateRange:
          dates.length > 0 ? [dates[0]!, dates[dates.length - 1]!] : undefined,
      },
    };
  },
};

export type CsvPreview = {
  headers: string[];
  rows: Record<string, string>[];
};

/** 读取 CSV 表头 + 前 N 行原始数据（列映射向导展示用） */
export async function readCsvPreview(
  ctx: ImportFileContext,
  previewRows = 3,
): Promise<CsvPreview> {
  const text = await ctx.readText();
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: 'greedy',
    preview: previewRows,
    transformHeader: (h) => h.trim(),
  });
  return {
    headers: (parsed.meta.fields ?? []).filter((f) => f.length > 0),
    rows: parsed.data,
  };
}
