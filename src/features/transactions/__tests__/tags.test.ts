import {
  LEGACY_SMART_NOTE_PREFIX,
  MAX_TAG_CHARS,
  SMART_TAG,
  isValidTag,
  sanitizeTags,
  stripLegacySmartNotePrefix,
  withTag,
} from '../tags';

describe('SMART_TAG', () => {
  it('符合「标签不超过两个字」的约定', () => {
    expect(isValidTag(SMART_TAG)).toBe(true);
    expect(Array.from(SMART_TAG).length).toBeLessThanOrEqual(MAX_TAG_CHARS);
  });
});

describe('isValidTag', () => {
  it.each(['智能', '报销', 'A'])('接受 %s', (tag) => {
    expect(isValidTag(tag)).toBe(true);
  });

  it.each(['', '智能识别', '  '])('拒绝 %s', (tag) => {
    expect(isValidTag(tag)).toBe(false);
  });
});

describe('sanitizeTags', () => {
  it('去空白、截断到两个字、去重并保持顺序', () => {
    expect(sanitizeTags([' 智能 ', '智能识别', '报销', '智能', '', '  '])).toEqual([
      '智能',
      '报销',
    ]);
  });

  it('空数组/缺省都得到空数组', () => {
    expect(sanitizeTags([])).toEqual([]);
    expect(sanitizeTags(undefined)).toEqual([]);
    expect(sanitizeTags(null)).toEqual([]);
  });
});

describe('withTag', () => {
  it('缺失时追加，已存在时返回同一个引用', () => {
    const tags = ['报销'];
    expect(withTag(tags, SMART_TAG)).toEqual(['报销', SMART_TAG]);
    expect(withTag(tags, '报销')).toBe(tags);
  });
});

describe('stripLegacySmartNotePrefix', () => {
  it('去掉旧标记并清理首尾空白', () => {
    expect(stripLegacySmartNotePrefix(`${LEGACY_SMART_NOTE_PREFIX}午饭`)).toBe('午饭');
    expect(stripLegacySmartNotePrefix(`${LEGACY_SMART_NOTE_PREFIX} 午饭 `)).toBe('午饭');
  });

  it('标记独占备注时得到空串', () => {
    expect(stripLegacySmartNotePrefix(LEGACY_SMART_NOTE_PREFIX)).toBe('');
  });

  it('没有标记时原样返回（仅裁掉首尾空白）', () => {
    expect(stripLegacySmartNotePrefix('午饭')).toBe('午饭');
  });
});
