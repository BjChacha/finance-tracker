import { Buffer } from 'buffer';
import { readBase64FromUri, type PickedDocument } from '@/lib/fs';
import type { ImportFileContext } from './types';

/**
 * 编码层：读文件字节（base64 → Buffer）+ 编码探测 + 解码。
 * 中文账单常见 GBK（如银行/旧版记账软件导出），iconv-lite 懒加载避免拖慢启动。
 */

export type SupportedEncoding = 'utf-8' | 'gbk' | 'utf-16le' | 'utf-16be';

/** UTF-8 BOM（EF BB BF） */
function hasUtf8Bom(bytes: Uint8Array): boolean {
  return bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
}

/** UTF-16 BOM：FF FE → LE，FE FF → BE */
function detectUtf16Bom(bytes: Uint8Array): SupportedEncoding | null {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) return 'utf-16le';
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) return 'utf-16be';
  return null;
}

/**
 * 校验字节序列是否为合法 UTF-8（纯函数）。
 * GBK 中文文本几乎必然产生非法 UTF-8 序列，可据此区分。
 */
export function isValidUtf8(bytes: Uint8Array): boolean {
  let i = 0;
  const len = bytes.length;
  while (i < len) {
    const b0 = bytes[i]!;
    if (b0 <= 0x7f) {
      i += 1;
      continue;
    }
    let extra: number;
    if ((b0 & 0xe0) === 0xc0) extra = 1;
    else if ((b0 & 0xf0) === 0xe0) extra = 2;
    else if ((b0 & 0xf8) === 0xf0) extra = 3;
    else return false;
    // 末尾截断的多字节序列（采样窗口边界）不算非法
    if (i + extra >= len) return true;
    for (let j = 1; j <= extra; j++) {
      if ((bytes[i + j]! & 0xc0) !== 0x80) return false;
    }
    i += extra + 1;
  }
  return true;
}

/** 探测编码：UTF-16 BOM → UTF-8 BOM → utf-8；采样前 64KB 校验 UTF-8 序列，非法 → 猜 GBK */
export function detectEncoding(bytes: Uint8Array): SupportedEncoding {
  const utf16 = detectUtf16Bom(bytes);
  if (utf16) return utf16;
  if (hasUtf8Bom(bytes)) return 'utf-8';
  const sample = bytes.length > 64 * 1024 ? bytes.subarray(0, 64 * 1024) : bytes;
  return isValidUtf8(sample) ? 'utf-8' : 'gbk';
}

/** 按指定编码解码字节；GBK/UTF-16 走 iconv-lite（懒加载：require 放函数内） */
export function decodeBytes(bytes: Uint8Array, encoding: SupportedEncoding): string {
  const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (encoding === 'gbk' || encoding === 'utf-16le' || encoding === 'utf-16be') {
    // 懒加载：仅在真正需要 GBK/UTF-16 解码时才加载 iconv-lite（约 300KB 码表）
    const iconv = require('iconv-lite') as typeof import('iconv-lite');
    return iconv.decode(buf, encoding);
  }
  let text = buf.toString('utf-8');
  // 去掉 BOM，避免首个表头字段带上不可见前缀
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  return text;
}

/** 基于已选文件构造 ImportFileContext；字节只读一次并缓存 */
export function createFileContext(picked: PickedDocument): ImportFileContext {
  let bytesPromise: Promise<Uint8Array> | null = null;
  const loadBytes = (): Promise<Uint8Array> => {
    bytesPromise ??= readBase64FromUri(picked.uri).then(
      (b64) => new Uint8Array(Buffer.from(b64, 'base64')),
    );
    return bytesPromise;
  };

  const readText = async (encoding?: SupportedEncoding): Promise<string> => {
    const bytes = await loadBytes();
    return decodeBytes(bytes, encoding ?? detectEncoding(bytes));
  };

  return {
    fileName: picked.name,
    mimeType: picked.mimeType,
    sizeBytes: picked.size,
    readText,
    async readHead(lines, encoding) {
      const text = await readText(encoding);
      return text.split(/\r\n|\r|\n/).slice(0, lines);
    },
  };
}

/** 包装 ctx，强制使用指定编码（预览乱码时用户手动切换后重新解析） */
export function withEncoding(
  ctx: ImportFileContext,
  encoding: SupportedEncoding,
): ImportFileContext {
  return {
    ...ctx,
    readText: () => ctx.readText(encoding),
    readHead: (lines) => ctx.readHead(lines, encoding),
  };
}
