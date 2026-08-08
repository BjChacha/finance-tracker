import { and, eq, inArray } from 'drizzle-orm';
import { db, withTransaction } from '@/db/client';
import { importBatches, importMappings, transactions } from '@/db/schema';
import { createAccount, listAccountsWithBalance } from '@/features/accounts';
import { createCategory, listCategoryTree } from '@/features/categories';
import { dayjs, toDateKey } from '@/lib/date';
import { newId } from '@/lib/id';
import { RATE_SCALE, toBaseCents } from '@/lib/money';
import type { PickedDocument } from '@/lib/fs';
import { createFileContext, withEncoding, type SupportedEncoding } from './encoding';
import { dedupe, type DedupeRow } from './dedupe';
import type { AdapterRegistry, DetectionCandidate } from './registry';
import type {
  ImportAdapter,
  ImportFileContext,
  NormalizedTransaction,
  ParseIssue,
  ParseResult,
} from './types';

/* ---------------------------------- 映射计划 ---------------------------------- */

export type MappingChoice =
  | { action: 'existing'; targetId: string; via?: 'memory' | 'similar' | 'default' }
  | { action: 'create' };

export interface MappingItem {
  kind: 'category' | 'account';
  /** 源账单文案；'' 表示该行未提供（展示为"未指定"） */
  sourceLabel: string;
  /** 仅 kind=category：目标分类的收支类型 */
  categoryType?: 'expense' | 'income';
  /** 建议选项（用户可改） */
  suggestion: MappingChoice;
}

export interface CategoryOption {
  id: string;
  /** 展示名：二级分类为 "父/子" */
  displayName: string;
  type: 'expense' | 'income';
}

export interface AccountOption {
  id: string;
  name: string;
}

export interface MappingPlan {
  categories: MappingItem[];
  accounts: MappingItem[];
  /** 供 UI 下拉选择的现有目标 */
  categoryOptions: CategoryOption[];
  accountOptions: AccountOption[];
}

/** 映射项在 choices 表中的键 */
export function mappingKey(item: Pick<MappingItem, 'kind' | 'sourceLabel' | 'categoryType'>) {
  return item.kind === 'category'
    ? `cat|${item.categoryType}|${item.sourceLabel}`
    : `acc|${item.sourceLabel}`;
}

/** 分类的组合标签："父/子" 或单级 */
function categoryLabel(tx: NormalizedTransaction): string {
  const main = (tx.rawCategory ?? '').trim();
  const sub = (tx.rawSubCategory ?? '').trim();
  if (main && sub) return `${main}/${sub}`;
  return main || sub;
}

function normalizeForMatch(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, '');
}

/** 相似度建议：精确相等 → 子级名相等 → 包含关系（双向，长度 ≥ 2） */
function suggestByName<T extends { id: string; names: string[] }>(
  label: string,
  targets: T[],
): T | null {
  const norm = normalizeForMatch(label);
  if (norm.length === 0) return null;
  const childPart = normalizeForMatch(label.split('/').pop() ?? '');
  for (const t of targets) {
    if (t.names.some((n) => n === norm)) return t;
  }
  if (childPart.length > 0 && childPart !== norm) {
    for (const t of targets) {
      if (t.names.some((n) => n === childPart)) return t;
    }
  }
  if (norm.length >= 2) {
    for (const t of targets) {
      if (t.names.some((n) => n.length >= 2 && (n.includes(norm) || norm.includes(n)))) return t;
    }
  }
  return null;
}

/* ---------------------------------- 预览/提交结果 ---------------------------------- */

export interface ImportPreview {
  newCount: number;
  duplicateCount: number;
  errorCount: number;
  rows: DedupeRow[];
  issues: ParseIssue[];
}

export interface CommitResult {
  batchId: string;
  inserted: number;
  skipped: number;
}

/* ---------------------------------- ImportSession ---------------------------------- */

/**
 * 导入会话状态机，驱动向导 UI：
 * pickFile → detect → setAdapter → parse → buildMappingPlan → applyMapping
 * → dedupe → preview → commit。
 *
 * 各步骤方法要求前序步骤已完成，否则抛错（UI 按步骤推进天然满足）。
 */
export class ImportSession {
  private readonly registry: AdapterRegistry;
  private file: PickedDocument | null = null;
  private baseCtx: ImportFileContext | null = null;
  private encoding: SupportedEncoding | null = null;
  private adapter: ImportAdapter | null = null;
  private config: unknown = undefined;
  private parseResult: ParseResult | null = null;
  private mappingPlan: MappingPlan | null = null;
  private choices = new Map<string, MappingChoice>();
  private dedupeRows: DedupeRow[] | null = null;

  constructor(registry: AdapterRegistry) {
    this.registry = registry;
  }

  /** 解析结果及其下游状态作废（换文件/换编码/换适配器后调用） */
  private resetDownstreamOfParse(): void {
    this.parseResult = null;
    this.mappingPlan = null;
    this.choices = new Map();
    this.dedupeRows = null;
  }

  /** 当前生效的文件上下文（带手动编码覆盖） */
  get ctx(): ImportFileContext {
    if (!this.baseCtx) throw new Error('尚未选择文件');
    return this.encoding ? withEncoding(this.baseCtx, this.encoding) : this.baseCtx;
  }

  get pickedFile(): PickedDocument | null {
    return this.file;
  }

  get currentAdapter(): ImportAdapter | null {
    return this.adapter;
  }

  get currentParseResult(): ParseResult | null {
    return this.parseResult;
  }

  get currentMappingPlan(): MappingPlan | null {
    return this.mappingPlan;
  }

  /** 步骤 1：选定文件，重置全部下游状态 */
  pickFile(picked: PickedDocument): void {
    this.file = picked;
    this.baseCtx = createFileContext(picked);
    this.encoding = null;
    this.adapter = null;
    this.config = undefined;
    this.resetDownstreamOfParse();
  }

  /** 手动切换编码（预览乱码时），需重新 parse */
  setEncoding(encoding: SupportedEncoding | null): void {
    this.encoding = encoding;
    this.resetDownstreamOfParse();
  }

  get currentEncoding(): SupportedEncoding | null {
    return this.encoding;
  }

  /** 步骤 2：并发探测候选格式（confidence 降序） */
  detect(): Promise<DetectionCandidate[]> {
    return this.registry.detectAll(this.ctx);
  }

  /** 步骤 3：选定适配器与配置；config 按 adapter.configSchema 校验 */
  setAdapter(id: string, config?: unknown): void {
    const adapter = this.registry.get(id);
    if (!adapter) throw new Error(`未知适配器：${id}`);
    if (adapter.configSchema && config !== undefined) {
      const result = adapter.configSchema.safeParse(config);
      if (!result.success) {
        const first = result.error.issues[0];
        throw new Error(`导入配置无效${first ? `（${first.path.join('.')}: ${first.message}）` : ''}`);
      }
      config = result.data;
    }
    this.adapter = adapter;
    this.config = config;
    this.resetDownstreamOfParse();
  }

  /**
   * 步骤 4：解析 + 标准化。
   * transfer 行缺 rawToAccount 时降级为 expense 并追加 warning issue。
   */
  async parse(): Promise<ParseResult> {
    if (!this.adapter) throw new Error('尚未选择导入格式');
    const result = await this.adapter.parse(this.ctx, this.config);
    const issues = [...result.issues];
    const txs = result.transactions.map((tx, i) => {
      if (tx.direction === 'transfer' && !(tx.rawToAccount ?? '').trim()) {
        issues.push({
          row: i + 1,
          message: `第 ${i + 1} 笔（按解析顺序）：转账缺少转入账户，已按支出导入`,
          severity: 'warning',
        });
        return { ...tx, direction: 'expense' as const, rawToAccount: undefined };
      }
      return tx;
    });
    this.parseResult = { ...result, transactions: txs, issues };
    this.mappingPlan = null;
    this.choices = new Map();
    this.dedupeRows = null;
    return this.parseResult;
  }

  /**
   * 步骤 5：收集去重后的 rawCategory/rawAccount，生成映射计划。
   * 建议优先级：import_mappings 记忆 → 名称相等/包含相似度 → 新建。
   */
  async buildMappingPlan(): Promise<MappingPlan> {
    if (!this.parseResult || !this.adapter) throw new Error('尚未解析文件');
    const txs = this.parseResult.transactions;

    // 现有目标
    const [expenseTree, incomeTree, accountList] = await Promise.all([
      listCategoryTree('expense'),
      listCategoryTree('income'),
      listAccountsWithBalance(),
    ]);
    const categoryOptions: CategoryOption[] = [];
    const categoryTargets: { id: string; names: string[]; type: 'expense' | 'income' }[] = [];
    for (const tree of [expenseTree, incomeTree]) {
      for (const parent of tree) {
        categoryOptions.push({ id: parent.id, displayName: parent.name, type: parent.type });
        categoryTargets.push({
          id: parent.id,
          names: [normalizeForMatch(parent.name)],
          type: parent.type,
        });
        for (const child of parent.children) {
          categoryOptions.push({
            id: child.id,
            displayName: `${parent.name}/${child.name}`,
            type: child.type,
          });
          categoryTargets.push({
            id: child.id,
            names: [
              normalizeForMatch(child.name),
              normalizeForMatch(`${parent.name}/${child.name}`),
            ],
            type: child.type,
          });
        }
      }
    }
    const accountOptions: AccountOption[] = accountList.map((a) => ({ id: a.id, name: a.name }));
    const accountTargets = accountList.map((a) => ({
      id: a.id,
      names: [normalizeForMatch(a.name)],
    }));

    // 去重收集源标签
    const categoryLabels = new Map<string, 'expense' | 'income'>();
    const accountLabels = new Set<string>();
    for (const tx of txs) {
      if (tx.direction === 'transfer') {
        accountLabels.add((tx.rawAccount ?? '').trim());
        accountLabels.add((tx.rawToAccount ?? '').trim());
      } else {
        const label = categoryLabel(tx);
        if (!categoryLabels.has(label)) categoryLabels.set(label, tx.direction);
        accountLabels.add((tx.rawAccount ?? '').trim());
      }
    }

    // 记忆表
    const allLabels = [...new Set([...categoryLabels.keys(), ...accountLabels])].filter(
      (l) => l.length > 0,
    );
    const memoryRows =
      allLabels.length > 0
        ? await db
            .select()
            .from(importMappings)
            .where(
              and(
                eq(importMappings.adapterId, this.adapter.id),
                inArray(importMappings.sourceLabel, allLabels),
              ),
            )
        : [];
    const memory = new Map(memoryRows.map((m) => [`${m.kind}|${m.sourceLabel}`, m.targetId]));

    // 分类映射项
    const categoryItems: MappingItem[] = [...categoryLabels.entries()].map(([label, type]) => {
      const targets = categoryTargets.filter((t) => t.type === type);
      let suggestion: MappingChoice = { action: 'create' };
      const remembered = memory.get(`category|${label}`);
      if (remembered && targets.some((t) => t.id === remembered)) {
        suggestion = { action: 'existing', targetId: remembered, via: 'memory' };
      } else if (label) {
        const similar = suggestByName(label, targets);
        if (similar) suggestion = { action: 'existing', targetId: similar.id, via: 'similar' };
      } else {
        // 未指定分类 → 建议落到预置的"其他支出/其他收入"
        const fallback = suggestByName(type === 'expense' ? '其他支出' : '其他收入', targets);
        if (fallback) suggestion = { action: 'existing', targetId: fallback.id, via: 'default' };
      }
      return { kind: 'category', sourceLabel: label, categoryType: type, suggestion };
    });

    // 账户映射项
    const accountItems: MappingItem[] = [...accountLabels].map((label) => {
      let suggestion: MappingChoice = { action: 'create' };
      const remembered = memory.get(`account|${label}`);
      if (remembered && accountTargets.some((t) => t.id === remembered)) {
        suggestion = { action: 'existing', targetId: remembered, via: 'memory' };
      } else if (label) {
        const similar = suggestByName(label, accountTargets);
        if (similar) suggestion = { action: 'existing', targetId: similar.id, via: 'similar' };
      } else if (accountOptions[0]) {
        // 未指定账户 → 默认第一个现有账户
        suggestion = { action: 'existing', targetId: accountOptions[0].id, via: 'default' };
      }
      return { kind: 'account', sourceLabel: label, suggestion };
    });

    this.mappingPlan = {
      categories: categoryItems,
      accounts: accountItems,
      categoryOptions,
      accountOptions,
    };
    // 默认采纳建议
    this.choices = new Map(
      [...categoryItems, ...accountItems].map((item) => [mappingKey(item), item.suggestion]),
    );
    return this.mappingPlan;
  }

  /** 步骤 6：应用用户确认的映射（覆盖建议） */
  applyMapping(choices: Map<string, MappingChoice>): void {
    if (!this.mappingPlan) throw new Error('尚未生成映射计划');
    for (const [key, choice] of choices) this.choices.set(key, choice);
  }

  /** 步骤 7：指纹去重（对照库中已有 + 本批内部重复） */
  async dedupe(): Promise<DedupeRow[]> {
    if (!this.parseResult || !this.adapter) throw new Error('尚未解析文件');
    this.dedupeRows = await dedupe(this.parseResult.transactions, this.adapter.id);
    return this.dedupeRows;
  }

  /** 步骤 8：预览统计 */
  preview(): ImportPreview {
    if (!this.parseResult || !this.dedupeRows) throw new Error('尚未完成去重');
    const duplicateCount = this.dedupeRows.filter((r) => r.duplicate).length;
    return {
      newCount: this.dedupeRows.length - duplicateCount,
      duplicateCount,
      errorCount: this.parseResult.issues.filter((i) => i.severity === 'error').length,
      rows: this.dedupeRows,
      issues: this.parseResult.issues,
    };
  }

  /**
   * 步骤 9：单事务提交。
   * 新建所需分类/账户 → 插入交易（写 fingerprint + importBatchId）
   * → 写 import_batches → upsert import_mappings 记忆。
   * 调用方负责提交后失效缓存（invalidateTransactionData 等）。
   */
  async commit(opts?: { includeDuplicates?: boolean }): Promise<CommitResult> {
    const { adapter, file, mappingPlan, dedupeRows } = this;
    if (!adapter || !file || !mappingPlan || !dedupeRows) {
      throw new Error('导入流程未完成，无法提交');
    }
    const rows = opts?.includeDuplicates ? dedupeRows : dedupeRows.filter((r) => !r.duplicate);
    const skipped = dedupeRows.length - rows.length;
    const batchId = newId();
    const now = Date.now();

    await withTransaction(async () => {
      // 0. 汇总各账户标签的币种/汇率（来自适配器；仅用于本次新建账户）
      const accCurrency = new Map<string, string>();
      const accRate = new Map<string, number>();
      for (const { row: tx } of dedupeRows) {
        const srcLabel = (tx.rawAccount ?? '').trim();
        if (srcLabel && tx.currency) {
          accCurrency.set(srcLabel, tx.currency);
          accRate.set(srcLabel, tx.exchangeRate ?? RATE_SCALE);
        }
        const dstLabel = (tx.rawToAccount ?? '').trim();
        if (dstLabel && tx.toCurrency) {
          accCurrency.set(dstLabel, tx.toCurrency);
          accRate.set(dstLabel, tx.toExchangeRate ?? RATE_SCALE);
        }
      }

      // 1. 解析映射选择 → 目标 id（create 的现场新建）
      const categoryIds = new Map<string, string>();
      for (const item of mappingPlan.categories) {
        const choice = this.choices.get(mappingKey(item)) ?? item.suggestion;
        categoryIds.set(
          mappingKey(item),
          choice.action === 'existing'
            ? choice.targetId
            : await ensureCategory(item.sourceLabel, item.categoryType ?? 'expense'),
        );
      }
      const accountIds = new Map<string, string>();
      for (const item of mappingPlan.accounts) {
        const choice = this.choices.get(mappingKey(item)) ?? item.suggestion;
        accountIds.set(
          mappingKey(item),
          choice.action === 'existing'
            ? choice.targetId
            : await createAccount({
                name: item.sourceLabel || '导入账户',
                type: 'other',
                icon: 'credit-card',
                color: '#64748B',
                initialBalance: 0,
                includeInTotal: true,
                currency: accCurrency.get(item.sourceLabel) ?? 'CNY',
                rateToBase: accRate.get(item.sourceLabel) ?? RATE_SCALE,
              }),
        );
      }
      const resolveAccount = (label: string | undefined): string => {
        const id = accountIds.get(mappingKey({ kind: 'account', sourceLabel: (label ?? '').trim() }));
        if (!id) throw new Error(`账户映射缺失：${label ?? '(未指定)'}`);
        return id;
      };

      // 2. 组装交易行
      const txRows = rows.map(({ row: tx, fingerprint }) => {
        const dateMs = dayjs(tx.date).valueOf();
        let type = tx.direction;
        const accountId = resolveAccount(tx.rawAccount);
        let toAccountId: string | null = null;
        let categoryId: string | null = null;
        if (type === 'transfer') {
          toAccountId = resolveAccount(tx.rawToAccount);
          if (toAccountId === accountId) {
            // 转入转出映射到了同一账户，无法成立转账 → 按支出落库
            type = 'expense';
            toAccountId = null;
          }
        }
        if (type !== 'transfer') {
          const key = mappingKey({
            kind: 'category',
            sourceLabel: categoryLabel(tx),
            categoryType: tx.direction === 'income' ? 'income' : 'expense',
          });
          categoryId = categoryIds.get(key) ?? null;
        }
        return {
          id: newId(),
          type,
          amount: tx.amountCents,
          fee: 0,
          currency: tx.currency ?? 'CNY',
          exchangeRate: tx.exchangeRate ?? RATE_SCALE,
          amountBaseCents: toBaseCents(tx.amountCents, tx.exchangeRate ?? RATE_SCALE),
          accountId,
          toAccountId,
          toAmount: type === 'transfer' ? (tx.toAmountCents ?? tx.amountCents) : null,
          categoryId,
          date: dateMs,
          dateKey: toDateKey(dateMs),
          note: tx.note ?? '',
          importBatchId: batchId,
          fingerprint,
          createdAt: now,
          updatedAt: now,
        };
      });

      // 3. 分批插入（≤200 行/批且绑定变量 ≤900）
      const cols = 19;
      const batchSize = Math.min(200, Math.floor(900 / cols));
      for (let i = 0; i < txRows.length; i += batchSize) {
        const chunk = txRows.slice(i, i + batchSize);
        if (chunk.length > 0) await db.insert(transactions).values(chunk);
      }

      // 4. 批次记录
      await db.insert(importBatches).values({
        id: batchId,
        adapterId: adapter.id,
        sourceName: file.name,
        importedAt: now,
        txCount: txRows.length,
        skippedCount: skipped,
      });

      // 5. 映射记忆 upsert（含本次新建的目标，下次导入自动命中）
      for (const item of [...mappingPlan.categories, ...mappingPlan.accounts]) {
        if (!item.sourceLabel) continue;
        const targetId =
          item.kind === 'category'
            ? categoryIds.get(mappingKey(item))
            : accountIds.get(mappingKey(item));
        if (!targetId) continue;
        await db
          .insert(importMappings)
          .values({
            id: newId(),
            adapterId: adapter.id,
            kind: item.kind,
            sourceLabel: item.sourceLabel,
            targetId,
          })
          .onConflictDoUpdate({
            target: [importMappings.adapterId, importMappings.kind, importMappings.sourceLabel],
            set: { targetId },
          });
      }
    });

    return { batchId, inserted: rows.length, skipped };
  }
}

/**
 * 确保标签对应的分类存在并返回 id。
 * "父/子" 标签会先找/建父级（一级分类），再在其下找/建子级。
 * 在 commit 事务内调用。
 */
async function ensureCategory(label: string, type: 'expense' | 'income'): Promise<string> {
  const parts = label
    .split('/')
    .map((p) => p.trim())
    .filter(Boolean);
  const parentName = parts[0] ?? '未分类';
  const childName = parts[1];

  const tree = await listCategoryTree(type);
  const parent = tree.find((c) => c.name === parentName);
  const parentId =
    parent?.id ??
    (await createCategory({ name: parentName, type, icon: 'package', color: '#9CA3AF', parentId: null }));
  if (!childName) return parentId;

  const existingChild = parent?.children.find((c) => c.name === childName);
  if (existingChild) return existingChild.id;
  return createCategory({ name: childName, type, icon: 'package', color: '#9CA3AF', parentId });
}

/* ---------------------------------- 撤销批次 ---------------------------------- */

/** 撤销一次导入：删除该批全部交易 + 批次记录（单事务） */
export async function undoBatch(batchId: string): Promise<number> {
  let removed = 0;
  await withTransaction(async () => {
    const rows = await db
      .delete(transactions)
      .where(eq(transactions.importBatchId, batchId))
      .returning({ id: transactions.id });
    removed = rows.length;
    await db.delete(importBatches).where(eq(importBatches.id, batchId));
  });
  return removed;
}
