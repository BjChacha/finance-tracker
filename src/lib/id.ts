import * as Crypto from 'expo-crypto';

/** 生成 UUID（expo-crypto，无需 polyfill） */
export function newId(): string {
  return Crypto.randomUUID();
}

/** SHA-256 十六进制摘要（导入去重指纹用） */
export async function sha256Hex(input: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, input);
}
