import { Stack } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { Category } from '@/db/schema';
import {
  useArchiveCategory,
  useCategoryTree,
  useCreateCategory,
  useUpdateCategory,
  type CategoryNode,
} from '@/features/categories';
import { zh } from '@/i18n/zh';
import { useTheme } from '@/theme';

const ICON_OPTIONS = ['🍜', '🚌', '🛒', '🏠', '🎮', '💊', '📚', '📱', '🎁', '💰', '📈', '📦'];
const COLOR_OPTIONS = ['#F97316', '#3B82F6', '#EC4899', '#8B5CF6', '#06B6D4', '#EF4444', '#10B981', '#F59E0B', '#9CA3AF'];

type EditorState = {
  /** null = 新增 */
  editing: Category | null;
  parentId: string | null;
} | null;

export default function CategoriesScreen() {
  const { colors } = useTheme();
  const [tab, setTab] = useState<'expense' | 'income'>('expense');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorState>(null);

  const { data: tree = [] } = useCategoryTree(tab);
  const archive = useArchiveCategory();

  function confirmArchive(cat: Category) {
    Alert.alert(`${zh.categories.archive}「${cat.name}」`, zh.categories.archiveConfirm, [
      { text: zh.common.cancel, style: 'cancel' },
      { text: zh.categories.archive, style: 'destructive', onPress: () => archive.mutate(cat.id) },
    ]);
  }

  function renderChild(child: Category) {
    return (
      <View key={child.id} style={[styles.childRow, { borderTopColor: colors.border }]}>
        <Text style={{ fontSize: 16 }}>{child.icon}</Text>
        <Text style={{ color: colors.text, fontSize: 14, flex: 1 }}>{child.name}</Text>
        {child.isPreset === 0 && (
          <Pressable onPress={() => setEditor({ editing: child, parentId: child.parentId })} hitSlop={8}>
            <Text style={{ color: colors.primary, fontSize: 13 }}>{zh.common.edit}</Text>
          </Pressable>
        )}
        <Pressable onPress={() => confirmArchive(child)} hitSlop={8}>
          <Text style={{ color: colors.expense, fontSize: 13, marginLeft: 14 }}>
            {zh.categories.archive}
          </Text>
        </Pressable>
      </View>
    );
  }

  function renderParent(node: CategoryNode) {
    const open = expanded === node.id;
    return (
      <View key={node.id} style={[styles.card, { backgroundColor: colors.card }]}>
        <Pressable
          style={styles.parentRow}
          onPress={() => setExpanded(open ? null : node.id)}
        >
          <View style={[styles.iconBox, { backgroundColor: `${node.color}33` }]}>
            <Text style={{ fontSize: 18 }}>{node.icon}</Text>
          </View>
          <Text style={{ color: colors.text, fontSize: 15, fontWeight: '500', flex: 1 }}>
            {node.name}
            {node.children.length > 0 ? `（${node.children.length}）` : ''}
          </Text>
          {node.isPreset === 0 && (
            <Pressable onPress={() => setEditor({ editing: node, parentId: null })} hitSlop={8}>
              <Text style={{ color: colors.primary, fontSize: 13 }}>{zh.common.edit}</Text>
            </Pressable>
          )}
          <Pressable onPress={() => confirmArchive(node)} hitSlop={8}>
            <Text style={{ color: colors.expense, fontSize: 13, marginLeft: 14 }}>
              {zh.categories.archive}
            </Text>
          </Pressable>
          <Text style={{ color: colors.textSecondary, marginLeft: 12 }}>{open ? '▾' : '▸'}</Text>
        </Pressable>
        {open && (
          <View>
            {node.children.map(renderChild)}
            <Pressable
              style={[styles.childRow, { borderTopColor: colors.border }]}
              onPress={() => setEditor({ editing: null, parentId: node.id })}
            >
              <Text style={{ color: colors.primary, fontSize: 13 }}>＋ {zh.categories.add}</Text>
            </Pressable>
          </View>
        )}
      </View>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: zh.categories.title,
          headerRight: () => (
            <Pressable onPress={() => setEditor({ editing: null, parentId: null })} hitSlop={12}>
              <Text style={{ color: colors.primary, fontSize: 15 }}>{zh.categories.add}</Text>
            </Pressable>
          ),
        }}
      />
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        {/* 支出/收入 tab */}
        <View style={[styles.segment, { backgroundColor: colors.card }]}>
          {(['expense', 'income'] as const).map((t) => (
            <Pressable
              key={t}
              style={[
                styles.segmentItem,
                tab === t && { backgroundColor: t === 'expense' ? colors.expense : colors.income },
              ]}
              onPress={() => {
                setTab(t);
                setExpanded(null);
              }}
            >
              <Text style={{ color: tab === t ? '#FFFFFF' : colors.textSecondary, fontWeight: '600' }}>
                {zh.tx[t]}
              </Text>
            </Pressable>
          ))}
        </View>
        <ScrollView contentContainerStyle={{ padding: 12 }}>
          {tree.length === 0 && (
            <Text style={{ color: colors.textSecondary, textAlign: 'center', marginTop: 24 }}>
              {zh.categories.empty}
            </Text>
          )}
          {tree.map(renderParent)}
          <Text style={{ color: colors.textSecondary, fontSize: 12, textAlign: 'center', marginTop: 8 }}>
            {zh.categories.presetHint}
          </Text>
        </ScrollView>
      </View>
      {editor && (
        <CategoryEditor
          type={tab}
          editing={editor.editing}
          parentId={editor.parentId}
          onClose={() => setEditor(null)}
        />
      )}
    </>
  );
}

function CategoryEditor({
  type,
  editing,
  parentId,
  onClose,
}: {
  type: 'expense' | 'income';
  editing: Category | null;
  parentId: string | null;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const [name, setName] = useState(editing?.name ?? '');
  const [icon, setIcon] = useState(editing?.icon ?? ICON_OPTIONS[0]!);
  const [color, setColor] = useState(editing?.color ?? COLOR_OPTIONS[0]!);
  const create = useCreateCategory();
  const update = useUpdateCategory();

  function handleSave() {
    if (!name.trim()) {
      Alert.alert(zh.categories.nameRequired);
      return;
    }
    const done = { onSuccess: onClose };
    if (editing) {
      update.mutate({ id: editing.id, input: { name: name.trim(), icon, color } }, done);
    } else {
      create.mutate({ name: name.trim(), type, icon, color, parentId }, done);
    }
  }

  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: colors.card }]} onPress={() => {}}>
          <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600', marginBottom: 12 }}>
            {editing ? zh.categories.edit : zh.categories.add}
          </Text>
          <TextInput
            style={[styles.input, { color: colors.text, borderColor: colors.border }]}
            value={name}
            onChangeText={setName}
            placeholder={zh.categories.namePlaceholder}
            placeholderTextColor={colors.textSecondary}
          />
          <View style={styles.chipRow}>
            {ICON_OPTIONS.map((i) => (
              <Pressable
                key={i}
                style={[styles.iconChip, { borderColor: icon === i ? colors.primary : colors.border }]}
                onPress={() => setIcon(i)}
              >
                <Text style={{ fontSize: 18 }}>{i}</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.chipRow}>
            {COLOR_OPTIONS.map((c) => (
              <Pressable
                key={c}
                style={[
                  styles.colorDot,
                  { backgroundColor: c },
                  color === c && { borderWidth: 3, borderColor: colors.text },
                ]}
                onPress={() => setColor(c)}
              />
            ))}
          </View>
          <View style={{ flexDirection: 'row', gap: 12, marginTop: 16 }}>
            <Pressable
              style={[styles.btn, { backgroundColor: colors.border }]}
              onPress={onClose}
            >
              <Text style={{ color: colors.text, fontWeight: '600' }}>{zh.common.cancel}</Text>
            </Pressable>
            <Pressable style={[styles.btn, { backgroundColor: colors.primary }]} onPress={handleSave}>
              <Text style={{ color: '#FFFFFF', fontWeight: '600' }}>{zh.common.save}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  segment: { flexDirection: 'row', margin: 12, borderRadius: 10, padding: 4 },
  segmentItem: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8 },
  card: { borderRadius: 12, marginBottom: 8, overflow: 'hidden' },
  parentRow: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10 },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  childRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  sheet: { borderRadius: 14, padding: 16, width: '100%' },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 15,
    marginBottom: 12,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  iconChip: {
    width: 38,
    height: 38,
    borderRadius: 9,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorDot: { width: 28, height: 28, borderRadius: 14 },
  btn: { flex: 1, borderRadius: 10, paddingVertical: 11, alignItems: 'center' },
});
