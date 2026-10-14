import { genericCsvAdapter, genericCsvConfigSchema } from '../generic-csv';
import type { ImportFileContext } from '../../core/types';

function ctxOf(text: string, fileName = 'bill.csv'): ImportFileContext {
  return {
    fileName,
    sizeBytes: text.length,
    readText: () => Promise.resolve(text),
    readHead: (lines) => Promise.resolve(text.split('\n').slice(0, lines)),
  };
}

describe('genericCsvAdapter.detect', () => {
  it('.csv → 恒 0.2 兜底置信度', async () => {
    const result = await genericCsvAdapter.detect(ctxOf('a,b\n1,2'));
    expect(result.confidence).toBe(0.2);
    expect(result.reason).toContain('通用 CSV');
  });

  it('非 .csv → 0', async () => {
    const result = await genericCsvAdapter.detect(ctxOf('a,b\n1,2', 'bill.xlsx'));
    expect(result.confidence).toBe(0);
  });
});

describe('genericCsvAdapter.parse（正负号方向模式）', () => {
  const csv = [
    '日期,金额,备注,分类,账户',
    '2026-07-01,-12.50,午餐,餐饮,微信',
    '2026-07-02,8000.00,工资,工资,银行卡',
    '2026/07/03,-3.5,咖啡,餐饮,微信',
    'not-a-date,-1.00,坏日期,,',
    '2026-07-05,abc,坏金额,,',
    '2026-07-06,0,零金额,,',
  ].join('\n');

  const config = {
    dateColumn: '日期',
    amountColumn: '金额',
    directionMode: 'sign' as const,
    categoryColumn: '分类',
    accountColumn: '账户',
    noteColumn: '备注',
  };

  it('负数=支出、正数=收入，金额转正整数分，坏行记 error issue', async () => {
    const result = await genericCsvAdapter.parse(ctxOf(csv), config);
    expect(result.transactions).toHaveLength(3);

    const [t1, t2, t3] = result.transactions;
    expect(t1).toMatchObject({
      direction: 'expense',
      amountCents: 1250,
      note: '午餐',
      rawCategory: '餐饮',
      rawAccount: '微信',
    });
    expect(t1!.date.slice(0, 10)).toBe('2026-07-01');
    expect(t2).toMatchObject({ direction: 'income', amountCents: 800000 });
    expect(t3).toMatchObject({ direction: 'expense', amountCents: 350 });
    expect(t3!.date.slice(0, 10)).toBe('2026-07-03'); // 斜杠日期自动识别

    const errors = result.issues.filter((i) => i.severity === 'error');
    expect(errors).toHaveLength(3); // 坏日期 + 坏金额 + 零金额
    expect(errors.map((e) => e.row)).toEqual([5, 6, 7]); // 源文件行号（表头第 1 行）
    expect(result.meta?.dateRange).toEqual(['2026-07-01', '2026-07-03']);
  });
});

describe('genericCsvAdapter.parse（方向列模式）', () => {
  const csv = [
    '时间,收支类型,金额,分类,账户,转入账户,对方',
    '2026-07-01,支出,12.50,餐饮,现金,,拉面店',
    '2026-07-02,收入,100.00,工资,工资卡,,老板',
    '2026-07-03,转账,500.00,提现,银行卡,现金,自己',
  ].join('\n');

  it('按标签映射方向，金额取绝对值', async () => {
    const result = await genericCsvAdapter.parse(ctxOf(csv), {
      dateColumn: '时间',
      amountColumn: '金额',
      directionMode: 'column',
      directionColumn: '收支类型',
      incomeLabels: ['收入'],
      transferLabels: ['转账'],
      categoryColumn: '分类',
      accountColumn: '账户',
      toAccountColumn: '转入账户',
      noteColumn: '对方',
    });
    expect(result.transactions.map((t) => t.direction)).toEqual([
      'expense',
      'income',
      'transfer',
    ]);
    expect(result.transactions.map((t) => t.amountCents)).toEqual([1250, 10000, 50000]);
    expect(result.transactions[2]).toMatchObject({
      rawCategory: '提现',
      rawAccount: '银行卡',
      rawToAccount: '现金',
    });
  });

  it('未命中任何标签的行按支出处理', async () => {
    const result = await genericCsvAdapter.parse(ctxOf('时间,收支类型,金额\n2026-07-01,不计收支,9.9'), {
      dateColumn: '时间',
      amountColumn: '金额',
      directionMode: 'column',
      directionColumn: '收支类型',
    });
    expect(result.transactions[0]!.direction).toBe('expense');
  });
});

describe('genericCsvConfigSchema', () => {
  it('缺少必填列 → 校验失败', () => {
    expect(genericCsvConfigSchema.safeParse({ directionMode: 'sign' }).success).toBe(false);
  });

  it('指定 dateFormat 严格解析', async () => {
    const result = await genericCsvAdapter.parse(ctxOf('d,a\n08/07/2026,-1.00'), {
      dateColumn: 'd',
      amountColumn: 'a',
      directionMode: 'sign',
      dateFormat: 'DD/MM/YYYY',
    });
    expect(result.transactions[0]!.date.slice(0, 10)).toBe('2026-07-08');
  });
});
