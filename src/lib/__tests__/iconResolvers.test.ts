import {
  ACCOUNT_ICON_KEYS,
  CATEGORY_ICON_KEYS,
  DEFAULT_ACCOUNT_KEY,
  DEFAULT_CATEGORY_KEY,
  EMOJI_TO_KEY,
  resolveIconKey,
} from '../iconResolvers';

// 说明：所有 key 是否“已注册”由 TypeScript 在编译期保证——
// `EMOJI_TO_KEY`/`CATEGORY_ICON_KEYS`/`ACCOUNT_ICON_KEYS`/`DEFAULT_*_KEY`
// 均以 `IconName`(= keyof typeof REGISTRY) 标注，未注册的 key 会直接编译失败。
// 这里只验证 resolver 的映射逻辑与兜底行为（避免在 jest 里引入 lucide 的 ESM）。

describe('resolveIconKey', () => {
  it('每个 emoji 都映射到对应 key', () => {
    for (const [emoji, key] of Object.entries(EMOJI_TO_KEY)) {
      expect(resolveIconKey(emoji, 'category')).toBe(key);
    }
  });

  it('已知 key 原样透传', () => {
    for (const key of CATEGORY_ICON_KEYS) {
      expect(resolveIconKey(key, 'category')).toBe(key);
    }
    for (const key of ACCOUNT_ICON_KEYS) {
      expect(resolveIconKey(key, 'account')).toBe(key);
    }
  });

  it('未知 / 空值按 kind 兜底', () => {
    expect(resolveIconKey('not-a-real-icon', 'category')).toBe(DEFAULT_CATEGORY_KEY);
    expect(resolveIconKey('not-a-real-icon', 'account')).toBe(DEFAULT_ACCOUNT_KEY);
    expect(resolveIconKey('', 'category')).toBe(DEFAULT_CATEGORY_KEY);
    expect(resolveIconKey(null, 'account')).toBe(DEFAULT_ACCOUNT_KEY);
    expect(resolveIconKey(undefined, 'category')).toBe(DEFAULT_CATEGORY_KEY);
  });

  it('默认 key 自身可透传', () => {
    expect(resolveIconKey(DEFAULT_CATEGORY_KEY, 'category')).toBe(DEFAULT_CATEGORY_KEY);
    expect(resolveIconKey(DEFAULT_ACCOUNT_KEY, 'account')).toBe(DEFAULT_ACCOUNT_KEY);
  });
});
