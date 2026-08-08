import * as fs from 'fs';
import * as path from 'path';
import { boheCsvAdapter } from '../bohe-csv';
import type { ImportFileContext } from '../../core/types';

/**
 * 用真实的薄荷导出全量文件（import_example/，UTF-16 LE + Tab，8215 行）验证适配器。
 * 编码已由框架层（encoding.ts）处理；此处直接按 UTF-16LE 解码后喂给 parse。
 */
const FILE = path.join(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  '..',
  'import_example',
  '薄荷记账_2026年7月25日.csv',
);

function readDecoded(): string {
  const buf = fs.readFileSync(FILE);
  // 文件为 UTF-16 LE（BOM FF FE）；Node Buffer 原生支持 utf16le 解码
  let text = buf.toString('utf16le');
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  return text;
}

function makeCtx(text: string): ImportFileContext {
  return {
    fileName: '薄荷记账_2026年7月25日.csv',
    sizeBytes: bufLen(text),
    readText: async () => text,
    readHead: async (n) => text.split(/\r\n|\r|\n/).slice(0, n),
  };
}
function bufLen(text: string): number {
  return Buffer.byteLength(text, 'utf16le');
}

describe('boheCsvAdapter — 真实全量文件', () => {
  if (!fs.existsSync(FILE)) {
    it.skip('缺少真实导出文件，跳过', () => {});
    return;
  }

  let res: Awaited<ReturnType<typeof boheCsvAdapter.parse>>;
  beforeAll(async () => {
    res = await boheCsvAdapter.parse(makeCtx(readDecoded()));
  });

  it('交易总数 = 支出7245 + 收入587 + 双边转账346 = 8178', () => {
    const expense = res.transactions.filter((t) => t.direction === 'expense').length;
    const income = res.transactions.filter((t) => t.direction === 'income').length;
    const transfer = res.transactions.filter((t) => t.direction === 'transfer').length;
    expect(expense).toBe(7245);
    expect(income).toBe(587);
    expect(transfer).toBe(346); // 380 转账 − 33 单边 − 1 双侧皆空
    expect(res.transactions.length).toBe(8178);
  });

  it('转账跳过：33 笔单边 + 1 笔双侧皆空；无 error', () => {
    const singleSided = res.issues.filter((i) => i.message.includes('单边转账'));
    const bothEmpty = res.issues.filter((i) => i.message.includes('付款/收款账户'));
    expect(singleSided.length).toBe(33);
    expect(bothEmpty.length).toBe(1);
    expect(res.issues.filter((i) => i.severity === 'error').length).toBe(0);
  });

  it('日期范围 2019-07-12 ~ 2026-07-25', () => {
    expect(res.meta?.dateRange).toEqual(['2019-07-12', '2026-07-25']);
    expect(res.meta?.sourceAppName).toBe('薄荷记账');
  });

  it('CNY 账户（招行B站卡）上的 JPY/USD 消费全部折算为 CNY', () => {
    const bili = res.transactions.filter((t) => t.rawAccount === '招行B站卡');
    expect(bili.length).toBeGreaterThan(0);
    expect(bili.every((t) => t.currency === 'CNY')).toBe(true);
  });

  it('纯外币账户（中国银行visa）保留 USD，未折算', () => {
    const visa = res.transactions.filter((t) => t.rawAccount === '中国银行visa');
    expect(visa.length).toBeGreaterThan(0);
    expect(visa.every((t) => t.currency === 'USD')).toBe(true);
  });

  it('不存在 currency=JPY 的交易（JPY 已被折算到 CNY 账户）', () => {
    expect(res.transactions.filter((t) => t.currency === 'JPY').length).toBe(0);
  });
});
