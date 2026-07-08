import type { z } from 'zod';

/**
 * 数据迁移框架核心契约。
 *
 * 新增第三方账单适配器 = 实现 ImportAdapter 的 1 个文件
 * + 在 src/features/import/adapters/index.ts 注册 1 行。
 */

/** 适配器解析出的标准化交易（尚未映射到本地分类/账户） */
export interface NormalizedTransaction {
  direction: 'expense' | 'income' | 'transfer';
  /** 金额（分），恒为正 */
  amountCents: number;
  /** 'YYYY-MM-DD' 或带时间的日期字符串（前 10 位必须是日期） */
  date: string;
  note?: string;
  /** 源账单里的分类文案（映射步骤转成本地分类） */
  rawCategory?: string;
  rawSubCategory?: string;
  /** 源账单里的账户文案（映射步骤转成本地账户） */
  rawAccount?: string;
  /** 仅 transfer：转入账户文案 */
  rawToAccount?: string;
  /** 源流水号；存在时优先参与去重指纹 */
  sourceId?: string;
  /** 原始行数据（预览/排错用） */
  raw?: Record<string, string>;
}

/** 框架提供给适配器的文件上下文：读文件与编码由框架负责 */
export interface ImportFileContext {
  fileName: string;
  mimeType?: string;
  sizeBytes: number;
  /** 读全文；不传 encoding 时自动探测（UTF-8 BOM / 无效 UTF-8 序列 → GBK） */
  readText(encoding?: 'utf-8' | 'gbk'): Promise<string>;
  /** 读前 N 行（探测格式用，避免适配器各自整读大文件） */
  readHead(lines: number, encoding?: 'utf-8' | 'gbk'): Promise<string[]>;
}

/** 格式探测结果；confidence ∈ [0,1]，0 表示完全不匹配 */
export interface DetectResult {
  confidence: number;
  reason?: string;
}

/** 解析过程中的行级问题 */
export interface ParseIssue {
  /** 源文件行号（含表头，从 1 开始） */
  row: number;
  message: string;
  severity: 'warning' | 'error';
}

export interface ParseResult {
  transactions: NormalizedTransaction[];
  issues: ParseIssue[];
  meta?: {
    sourceAppName?: string;
    /** [最早, 最晚] date_key */
    dateRange?: [string, string];
  };
}

/** 账单导入适配器契约 */
export interface ImportAdapter {
  /** 全局唯一，如 'generic-csv'、'alipay-csv'；写入 import_batches/import_mappings */
  id: string;
  /** 向导里展示的中文名 */
  displayName: string;
  /** 支持的扩展名（含点，小写），如 ['.csv'] */
  fileExtensions: string[];
  /** 需要用户配置时提供（如通用 CSV 的列映射），parse 的 config 以此校验 */
  configSchema?: z.ZodType;
  /** 探测文件是否为本适配器支持的格式 */
  detect(ctx: ImportFileContext): Promise<DetectResult>;
  /** 解析为标准化交易；坏行记入 issues 而非整体失败 */
  parse(ctx: ImportFileContext, config?: unknown): Promise<ParseResult>;
}
