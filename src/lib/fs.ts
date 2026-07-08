import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

/**
 * 文件适配层：隔离 expo-file-system SDK 57 新 API（File/Directory/Paths）、
 * expo-sharing 与 expo-document-picker。业务代码一律经此模块读写/分享/选择文件，
 * 未来 API 变动只改这里。
 */

/** 写文本到缓存目录，返回文件 uri */
export function writeTextToCache(filename: string, content: string): Promise<string> {
  const file = new File(Paths.cache, filename);
  if (!file.exists) file.create({ intermediates: true });
  file.write(content);
  return Promise.resolve(file.uri);
}

/** 按 UTF-8 读取文件文本 */
export function readTextFromUri(uri: string): Promise<string> {
  return new File(uri).text();
}

/**
 * 读取文件原始内容为 base64（供 Buffer 解码任意编码，如 GBK）。
 * 上层用 Buffer.from(b64, 'base64') 拿到字节再按需解码。
 */
export function readBase64FromUri(uri: string): Promise<string> {
  return new File(uri).base64();
}

/** 调起系统分享面板分享本地文件 */
export async function shareFile(uri: string, mimeType: string): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('当前设备不支持分享文件');
  }
  await Sharing.shareAsync(uri, { mimeType });
}

export type PickedDocument = {
  uri: string;
  name: string;
  size: number;
  mimeType?: string;
};

/**
 * 调起系统文件选择器选择单个文件。
 * @param extensions 允许的扩展名（如 ['.csv', '.json']），小写比对；
 *   Android 各文件管理器的 MIME 标注很不可靠（CSV 常被标成 excel/octet-stream），
 *   因此选择器放开为全部类型，选完后再按扩展名校验。
 * @returns 选中的文件信息；用户取消返回 null；扩展名不符抛错（中文提示）。
 */
export async function pickDocument(extensions: string[]): Promise<PickedDocument | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: '*/*',
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled) return null;
  const asset = result.assets[0];
  if (!asset) return null;

  const name = asset.name ?? '';
  const dot = name.lastIndexOf('.');
  const ext = dot >= 0 ? name.slice(dot).toLowerCase() : '';
  // 文件名带扩展名但不在允许列表 → 拒绝；无扩展名放行（交给上层探测/校验）
  if (ext && extensions.length > 0 && !extensions.map((e) => e.toLowerCase()).includes(ext)) {
    throw new Error(`请选择 ${extensions.join(' / ')} 文件`);
  }
  return {
    uri: asset.uri,
    name,
    size: asset.size ?? 0,
    mimeType: asset.mimeType,
  };
}
