import { Buffer } from 'buffer';
import { decodeBytes, detectEncoding, isValidUtf8 } from '../encoding';

describe('isValidUtf8', () => {
  it('ASCII 与合法 UTF-8 中文 → true', () => {
    expect(isValidUtf8(new Uint8Array(Buffer.from('hello', 'utf-8')))).toBe(true);
    expect(isValidUtf8(new Uint8Array(Buffer.from('日期,金额,备注', 'utf-8')))).toBe(true);
  });

  it('GBK 编码的中文字节 → false（含非法 UTF-8 序列）', () => {
    const iconv = require('iconv-lite') as typeof import('iconv-lite');
    const gbkBytes = new Uint8Array(iconv.encode('日期，金额，备注：午餐拉面', 'gbk'));
    expect(isValidUtf8(gbkBytes)).toBe(false);
  });
});

describe('detectEncoding', () => {
  it('UTF-8 BOM → utf-8', () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...Buffer.from('日期', 'utf-8')]);
    expect(detectEncoding(bytes)).toBe('utf-8');
  });

  it('合法 UTF-8（无 BOM）→ utf-8', () => {
    expect(detectEncoding(new Uint8Array(Buffer.from('日期,金额', 'utf-8')))).toBe('utf-8');
  });

  it('GBK 中文 → gbk', () => {
    const iconv = require('iconv-lite') as typeof import('iconv-lite');
    const gbkBytes = new Uint8Array(iconv.encode('交易时间,交易分类,金额（元）', 'gbk'));
    expect(detectEncoding(gbkBytes)).toBe('gbk');
  });
});

describe('decodeBytes', () => {
  it('utf-8 解码并去除 BOM', () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...Buffer.from('日期,金额', 'utf-8')]);
    expect(decodeBytes(bytes, 'utf-8')).toBe('日期,金额');
  });

  it('gbk 解码（iconv-lite 懒加载路径）中文往返一致', () => {
    const iconv = require('iconv-lite') as typeof import('iconv-lite');
    const text = '交易时间,收/支,金额（元）\n2026-07-08,支出,12.50';
    const gbkBytes = new Uint8Array(iconv.encode(text, 'gbk'));
    expect(decodeBytes(gbkBytes, 'gbk')).toBe(text);
  });
});
