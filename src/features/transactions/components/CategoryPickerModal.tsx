import { useEffect, useState } from 'react';
import { Keyboard, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { SlideInDown } from 'react-native-reanimated';
import { Icon } from '@/components/Icon';
import { IconBubble } from '@/components/IconBubble';
import { SingleLineTextInput } from '@/components/single-line-text-input';
import { useCreateCategory, type CategoryNode } from '@/features/categories';
import { zh } from '@/i18n/zh';
import { matchText } from '@/lib/fuzzy';
import { resolveIconKey } from '@/lib/iconResolvers';
import { motion, useTheme, type AppTheme } from '@/theme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** 快速创建分类的默认色（与分类编辑器新建默认一致） */
const DEFAULT_CATEGORY_COLOR = '#F97316';

type Row = {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
  /** 父：父名；子：「父 › 子」 */
  path: string;
  isChild: boolean;
};

type Props = {
  visible: boolean;
  tree: CategoryNode[];
  categoryType: 'expense' | 'income';
  selectedId: string | null;
  onSelect: (id: string) => void;
  onClose: () => void;
};

/** 「全部分类」弹窗：模糊搜索 + 父/子平铺点选 + 无结果时快速创建。 */
export function CategoryPickerModal({ visible, tree, categoryType, selectedId, onSelect, onClose }: Props) {
  const theme = useTheme();
  const { colors } = theme;
  const [query, setQuery] = useState('');
  // 键盘避让：底部弹层用 marginBottom 抬升到键盘上方（不破坏 SlideInDown 入场动画）。
  const [kbHeight, setKbHeight] = useState(0);
  useEffect(() => {
    if (!visible) return;
    const show = Keyboard.addListener('keyboardDidShow', (e) => setKbHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKbHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, [visible]);
  const createCat = useCreateCategory();

  if (!visible) return null;

  const rows: Row[] = [];
  for (const p of tree) {
    rows.push({ id: p.id, name: p.name, icon: p.icon, color: p.color, path: p.name, isChild: false });
    for (const c of p.children) {
      rows.push({
        id: c.id,
        name: c.name,
        icon: c.icon,
        color: c.color,
        path: `${p.name} › ${c.name}`,
        isChild: true,
      });
    }
  }

  const q = query.trim();
  const filtered = q === '' ? rows : rows.filter((r) => matchText(q, r.path) || matchText(q, r.name));
  const exactExists = q !== '' && rows.some((r) => r.name.toLowerCase() === q.toLowerCase());
  const canCreate = q !== '' && !exactExists;

  function close() {
    setQuery('');
    onClose();
  }
  function handlePick(id: string) {
    onSelect(id);
    close();
  }
  async function handleCreate() {
    if (!q) return;
    try {
      const newId = await createCat.mutateAsync({
        name: q,
        type: categoryType,
        icon: 'package',
        color: DEFAULT_CATEGORY_COLOR,
        parentId: null,
      });
      onSelect(newId);
      close();
    } catch {
      /* 创建失败保留弹窗，用户可重试 */
    }
  }

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={close}>
      <Pressable style={styles.mask} onPress={close}>
        {/* 遮罩 fade + 面板上滑分离（业界底部弹层规范） */}
        <AnimatedPressable
          entering={SlideInDown.duration(motion.enter)}
          style={[styles.sheet, { backgroundColor: colors.card, marginBottom: kbHeight }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.text }]}>{zh.tx.categoryAll}</Text>
            <Pressable onPress={close} hitSlop={8}>
              <Icon name="chevron-down" size={22} color={colors.textSecondary} />
            </Pressable>
          </View>

          <View style={[styles.searchBox, { borderColor: colors.border }]}>
            <Icon name="search" size={16} color={colors.textSecondary} />
            <SingleLineTextInput
              style={[styles.searchInput, { color: colors.text }]}
              value={query}
              onChangeText={setQuery}
              placeholder={zh.tx.categorySearch}
              placeholderTextColor={colors.textSecondary}
              autoFocus
            />
          </View>

          <ScrollView style={{ maxHeight: 360 }} keyboardShouldPersistTaps="handled">
            {canCreate && (
              <Pressable
                style={[
                  styles.row,
                  { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
                ]}
                onPress={handleCreate}
                disabled={createCat.isPending}
              >
                <IconBubble name="plus" color={colors.primary} size={32} />
                <Text style={[styles.rowName, { color: colors.primary }]}>{zh.tx.categoryCreate(q)}</Text>
              </Pressable>
            )}
            {filtered.length === 0 && !canCreate ? (
              <View style={styles.empty}>
                <Text style={{ color: colors.textSecondary }}>{zh.tx.categorySearchEmpty}</Text>
              </View>
            ) : (
              filtered.map((r) => {
                const selected = r.id === selectedId;
                return (
                  <Pressable
                    key={r.id}
                    style={[styles.row, r.isChild && styles.rowChild, selected && { backgroundColor: `${colors.primary}14` }]}
                    onPress={() => handlePick(r.id)}
                  >
                    <IconBubble
                      name={resolveIconKey(r.icon, 'category')}
                      color={r.color ?? colors.primary}
                      size={32}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.rowName, { color: colors.text }]} numberOfLines={1}>
                        {r.name}
                      </Text>
                      {r.isChild && (
                        <Text style={[styles.rowPath, { color: colors.textSecondary }]} numberOfLines={1}>
                          {r.path}
                        </Text>
                      )}
                    </View>
                    {selected && <Icon name="check" size={18} color={colors.primary} />}
                  </Pressable>
                );
              })
            )}
          </ScrollView>
        </AnimatedPressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  mask: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16, paddingBottom: 32 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  title: { fontSize: 16, fontWeight: '600' },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 8,
  },
  searchInput: { flex: 1, height: 24, fontSize: 15 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  rowChild: { paddingLeft: 24 },
  rowName: { fontSize: 15, fontWeight: '500' },
  rowPath: { fontSize: 12, marginTop: 2 },
  empty: { paddingVertical: 32, alignItems: 'center' },
});
