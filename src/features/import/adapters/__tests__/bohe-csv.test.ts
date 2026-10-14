import { boheCsvAdapter } from '../bohe-csv';
import type { ImportFileContext } from '../../core/types';

/** 构造内存 ctx：readText 返回已解码文本（编码由框架层负责，单测不涉及） */
function makeCtx(text: string): ImportFileContext {
  return {
    fileName: '薄荷记账_2026.csv',
    sizeBytes: text.length,
    readText: async () => text,
    readHead: async (n) => text.split(/\r\n|\r|\n/).slice(0, n),
  };
}

const HEADER =
  '类型\t货币\t金额\t汇率（相对本位币）\t项目\t分类\t父类\t账户\t付款\t收款\t商家\t地址\t日期\t标签\t作者\t备注\t图一\t图二\t图三';

function row(...fields: string[]): string {
  // 补齐到 19 列
  const padded = [...fields];
  while (padded.length < 19) padded.push('');
  return padded.join('\t');
}

/** 一份覆盖关键场景的薄荷导出片段 */
function sampleTsv(): string {
  return [
    HEADER,
    row('支出', 'CNY', '-23', '1.0000', '', '正餐', '饮食', '广发多利卡', '', '', '', '', '2026-07-25 18:27', '', 'BjChacha', ''),
    row('收入', 'CNY', '380', '1.0000', '', '退款', '', '微信', '', '', '', '', '2026-07-25 09:00', '', 'BjChacha', ''),
    row('转账', 'CNY', '500', '1.0000', '', '账户互转', '', '', '工资卡', '余额宝', '', '', '2026-07-24 10:00', '', 'BjChacha', ''),
    row('转账', 'CNY', '100', '1.0000', '', '信用卡还款', '', '', '中国银行', '', '', '', '2026-07-23 10:00', '', 'BjChacha', '花呗还款'), // 单边：无收款
    row('支出', 'USD', '-19.99', '6.7606', '', '网络服务', '', '中国银行visa', '', '', '', '', '2026-06-17 00:40', '', 'BjChacha', 'chatgpt plus'),
    row('支出', 'CNY', '-12', '1.0000', '', '网络服务', '', '招行B站卡', '', '', '', '', '2026-06-10 12:00', '', 'BjChacha', ''),
    row('支出', 'JPY', '-650', '0.0448', '', '网络服务', '', '招行B站卡', '', '', '', '', '2026-01-25 12:19', '', 'BjChacha', ''),
    `支出\tCNY\t-50\t1.0000\t\t其他\t\t现金\t\t\t\t\t2026-07-20 10:00\t\tBjChacha\t"美团订单\n电费分摊"\t\t\t`,
  ].join('\n');
}

describe('boheCsvAdapter.detect', () => {
  it('命中薄荷表头 → confidence 0.9', async () => {
    const r = await boheCsvAdapter.detect(makeCtx(sampleTsv()));
    expect(r.confidence).toBe(0.9);
  });

  it('非 .csv 或表头不符 → 0', async () => {
    expect((await boheCsvAdapter.detect({ ...makeCtx(sampleTsv()), fileName: 'x.txt' })).confidence).toBe(0);
    const weird = makeCtx('a,b,c\n1,2,3');
    expect((await boheCsvAdapter.detect(weird)).confidence).toBe(0);
  });
});

describe('boheCsvAdapter.parse', () => {
  async function parseAll() {
    const res = await boheCsvAdapter.parse(makeCtx(sampleTsv()));
    return res;
  }

  it('生成 7 笔交易；单边转账被跳过并记 warning', async () => {
    const res = await parseAll();
    expect(res.transactions).toHaveLength(7);
    const warnings = res.issues.filter((i) => i.severity === 'warning' && i.message.includes('单边转账'));
    expect(warnings.length).toBe(1);
  });

  it('CNY 支出：方向/金额/币种/父子分类', async () => {
    const res = await parseAll();
    const tx = res.transactions.find((t) => t.rawAccount === '广发多利卡')!;
    expect(tx.direction).toBe('expense');
    expect(tx.amountCents).toBe(2300);
    expect(tx.currency).toBe('CNY');
    expect(tx.exchangeRate).toBe(1_000_000);
    expect(tx.rawCategory).toBe('饮食/正餐');
  });

  it('转账：双账户 + 同币种两侧金额相等', async () => {
    const res = await parseAll();
    const tx = res.transactions.find((t) => t.direction === 'transfer')!;
    expect(tx.rawAccount).toBe('工资卡');
    expect(tx.rawToAccount).toBe('余额宝');
    expect(tx.amountCents).toBe(50000);
    expect(tx.toAmountCents).toBe(50000);
    expect(tx.currency).toBe('CNY');
    expect(tx.rawCategory).toBe('账户互转');
    expect(tx.note).not.toContain('#账户互转');
  });

  it('纯外币账户（中国银行visa=USD）：保留 USD + 汇率', async () => {
    const res = await parseAll();
    const tx = res.transactions.find((t) => t.rawAccount === '中国银行visa')!;
    expect(tx.currency).toBe('USD');
    expect(tx.amountCents).toBe(1999);
    expect(tx.exchangeRate).toBe(6_760_600);
    expect(tx.note).toContain('chatgpt plus');
  });

  it('CNY 账户上的 JPY 消费：折算为 CNY，备注保留原币', async () => {
    const res = await parseAll();
    // 招行B站卡有两笔（CNY 原始 + JPY 折算）；JPY 那笔 amountCents 应为折算值
    const jpyTx = res.transactions.find((t) => t.rawAccount === '招行B站卡' && t.amountCents !== 1200)!;
    expect(jpyTx.currency).toBe('CNY');
    // 65000 × 44800 / 1e6 = 2912
    expect(jpyTx.amountCents).toBe(2912);
    expect(jpyTx.note).toContain('JPY');
  });

  it('多行备注（引号包裹的换行）被解析为单笔交易', async () => {
    const res = await parseAll();
    const tx = res.transactions.find((t) => t.rawAccount === '现金')!;
    expect(tx).toBeTruthy();
    expect(tx.note).toContain('美团订单');
    expect(tx.note).toContain('电费分摊');
  });

  it('meta.sourceAppName 与 dateRange', async () => {
    const res = await parseAll();
    expect(res.meta?.sourceAppName).toBe('薄荷记账');
    expect(res.meta?.dateRange?.[0]).toBe('2026-01-25');
    expect(res.meta?.dateRange?.[1]).toBe('2026-07-25');
  });
});
