import {
  ASSET_CATEGORY_DEFINITIONS,
  DEFAULT_ASSET_CATEGORY,
  isAssetCategoryKey,
  listAssetSubcategories,
  resolveAssetCategory,
} from '../meta';

describe('asset category presets', () => {
  it('父类 key 唯一且默认类别在预设内', () => {
    const keys = ASSET_CATEGORY_DEFINITIONS.map((d) => d.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toContain(DEFAULT_ASSET_CATEGORY);
  });

  it('二级叶子 key 全局唯一且不与父类冲突', () => {
    const parentKeys = new Set(ASSET_CATEGORY_DEFINITIONS.map((d) => d.key));
    const leafKeys = ASSET_CATEGORY_DEFINITIONS.flatMap((d) => d.children.map((c) => c.key));
    expect(new Set(leafKeys).size).toBe(leafKeys.length);
    for (const key of leafKeys) expect(parentKeys.has(key)).toBe(false);
  });

  it('resolveAssetCategory 命中父类，未知值回落 other', () => {
    const electronics = resolveAssetCategory('electronics');
    expect(electronics.label).toBe('电子数码');
    expect(electronics.parentKey).toBe('electronics');
    expect(electronics.isLeaf).toBe(false);
    expect(resolveAssetCategory('not-a-key').key).toBe('other');
    expect(resolveAssetCategory(null).key).toBe('other');
    expect(resolveAssetCategory(undefined).key).toBe('other');
  });

  it('叶子分类解析：用自身图标、继承父类颜色与归属', () => {
    const phone = resolveAssetCategory('phone');
    expect(phone.key).toBe('phone');
    expect(phone.label).toBe('手机');
    expect(phone.isLeaf).toBe(true);
    expect(phone.parentKey).toBe('electronics');
    expect(phone.parentLabel).toBe('电子数码');
    expect(phone.color).toBe('#3B82F6');
    expect(phone.icon).toBe('smartphone');

    const laptop = resolveAssetCategory('laptop');
    expect(laptop.icon).toBe('laptop');
    expect(laptop.parentKey).toBe('electronics');
  });

  it('isAssetCategoryKey 支持父类与叶子', () => {
    expect(isAssetCategoryKey('vehicle')).toBe(true);
    expect(isAssetCategoryKey('phone')).toBe(true);
    expect(isAssetCategoryKey('Vehicle')).toBe(false);
    expect(isAssetCategoryKey('')).toBe(false);
  });

  it('listAssetSubcategories 返回该大类二级，无则空数组', () => {
    expect(listAssetSubcategories('electronics').map((c) => c.key)).toContain('phone');
    expect(listAssetSubcategories('electronics').map((c) => c.key)).toContain('laptop');
    expect(listAssetSubcategories('nope')).toEqual([]);
  });
});
