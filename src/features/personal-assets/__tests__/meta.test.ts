import {
  ASSET_CATEGORY_DEFINITIONS,
  DEFAULT_ASSET_CATEGORY,
  isAssetCategoryKey,
  resolveAssetCategory,
} from '../meta';

describe('asset category presets', () => {
  it('key 唯一且默认类别在预设内', () => {
    const keys = ASSET_CATEGORY_DEFINITIONS.map((d) => d.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toContain(DEFAULT_ASSET_CATEGORY);
  });

  it('resolveAssetCategory 命中预设，未知值回落 other', () => {
    expect(resolveAssetCategory('electronics').label).toBe('电子数码');
    expect(resolveAssetCategory('not-a-key').key).toBe('other');
    expect(resolveAssetCategory(null).key).toBe('other');
    expect(resolveAssetCategory(undefined).key).toBe('other');
  });

  it('isAssetCategoryKey 精确匹配', () => {
    expect(isAssetCategoryKey('vehicle')).toBe(true);
    expect(isAssetCategoryKey('Vehicle')).toBe(false);
    expect(isAssetCategoryKey('')).toBe(false);
  });
});
