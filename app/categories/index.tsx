import { useQueryClient } from '@tanstack/react-query';
import { previewCategoryOrganization, organizeCategories } from '@/features/categories/organization';
import { organizationLabels as organization } from '@/features/categories/organization-labels';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { showDialog } from '@/components/dialog';
import { IdentityEditor } from '@/components/form/identity-editor';
import {
  SecondarySheetScreen,
  SheetHeaderIconButton,
} from '@/components/navigation/secondary-sheet-screen';
import type { Category, CategoryType } from '@/db/schema';
import {
  useArchiveCategory,
  useCategoryTree,
  useCreateCategory,
  useUpdateCategory,
  type CategoryNode,
} from '@/features/categories';
import { Icon } from '@/components/Icon';
import { IconBubble } from '@/components/IconBubble';
import { zh } from '@/i18n/zh';
import { CATEGORY_ICON_KEYS, resolveIconKey } from '@/lib/iconResolvers';
import { useTheme } from '@/theme';

const COLOR_OPTIONS = ['#F97316', '#3B82F6', '#EC4899', '#8B5CF6', '#06B6D4', '#EF4444', '#10B981', '#F59E0B', '#9CA3AF'];

type EditorState = {
  /** null = 新增 */
  editing: Category | null;
  parentId: string | null;
} | null;

export default function CategoriesScreen() {
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const [organizing, setOrganizing] = useState(false);
  const [tab, setTab] = useState<CategoryType>('expense');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorState>(null);

  const { data: tree = [] } = useCategoryTree(tab);
  const archive = useArchiveCategory();

  function onOrganize() {
    const plan = previewCategoryOrganization();
    if (!plan.length) { showDialog(organization.title, organization.empty); return; }
    showDialog(organization.title, organization.confirm + '\n\n' + plan.map((move) => `${move.name} → ${move.parentName}`).join('\n'), [
      { text: organization.cancel, style: 'cancel' },
      { text: organization.apply, onPress: () => {
        setOrganizing(true);
        void organizeCategories(plan).then(async () => {
          await queryClient.invalidateQueries();
          showDialog(organization.title, organization.done);
        }).catch((error: unknown) => showDialog(organization.error, error instanceof Error ? error.message : String(error)))
          .finally(() => setOrganizing(false));
      } },
    ]);
  }

  function confirmArchive(cat: Category) {
    showDialog(`${zh.categories.archive}「${cat.name}」`, zh.categories.archiveConfirm, [
      { text: zh.common.cancel, style: 'cancel' },
      { text: zh.categories.archive, style: 'destructive', onPress: () => archive.mutate(cat.id) },
    ]);
  }

  function renderChild(child: Category) {
    return (
      <View key={child.id} style={[styles.childRow, { borderTopColor: colors.border }]}>
        <Icon name={resolveIconKey(child.icon, 'category')} size={18} color={child.color} />
        <Text style={{ color: colors.text, fontSize: 14, flex: 1 }}>{child.name}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={`${zh.common.edit} ${child.name}`} style={({ pressed }) => [styles.rowAction, { opacity: pressed ? 0.55 : 1 }]} onPress={() => setEditor({ editing: child, parentId: child.parentId })}>
          <Text style={{ color: colors.text, fontSize: 14 }}>{zh.common.edit}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={`${zh.categories.archive} ${child.name}`} style={({ pressed }) => [styles.rowAction, { opacity: pressed ? 0.55 : 1 }]} onPress={() => confirmArchive(child)}>
          <Text style={{ color: colors.expense, fontSize: 14 }}>
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
          <IconBubble name={resolveIconKey(node.icon, 'category')} color={node.color} size={36} />
          <Text style={{ color: colors.text, fontSize: 15, fontWeight: '500', flex: 1 }}>
            {node.name}
            {node.children.length > 0 ? `（${node.children.length}）` : ''}
          </Text>
          <Pressable accessibilityRole="button" accessibilityLabel={`${zh.common.edit} ${node.name}`} style={({ pressed }) => [styles.rowAction, { opacity: pressed ? 0.55 : 1 }]} onPress={() => setEditor({ editing: node, parentId: null })}>
            <Text style={{ color: colors.text, fontSize: 14 }}>{zh.common.edit}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={`${zh.categories.archive} ${node.name}`} style={({ pressed }) => [styles.rowAction, { opacity: pressed ? 0.55 : 1 }]} onPress={() => confirmArchive(node)}>
            <Text style={{ color: colors.expense, fontSize: 14 }}>
              {zh.categories.archive}
            </Text>
          </Pressable>
          <Icon
            name={open ? 'chevron-down' : 'chevron-right'}
            size={16}
            color={colors.textSecondary}
            style={{ marginLeft: 12 }}
          />
        </Pressable>
        {open && (
          <View>
            {node.children.map(renderChild)}
            <Pressable
              style={[styles.childRow, { borderTopColor: colors.border }]}
              onPress={() => setEditor({ editing: null, parentId: node.id })}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Icon name="plus" size={16} color={colors.primary} />
                <Text style={{ color: colors.primary, fontSize: 13 }}>{zh.categories.add}</Text>
              </View>
            </Pressable>
          </View>
        )}
      </View>
    );
  }

  return (
    <SecondarySheetScreen
      title={zh.categories.title}
      headerRight={
        <SheetHeaderIconButton
          icon="plus"
          label={zh.categories.add}
          onPress={() => setEditor({ editing: null, parentId: null })}
        />
      }
    >
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        {/* 分类类型 tab */}
        <View style={[styles.segment, { backgroundColor: colors.card }]}>
          {(['expense', 'income', 'transfer'] as const).map((t) => (
            <Pressable
              key={t}
              style={[
                styles.segmentItem,
                tab === t && {
                  backgroundColor:
                    t === 'expense' ? colors.expense : t === 'income' ? colors.income : colors.transfer,
                },
              ]}
              onPress={() => {
                setTab(t);
                setExpanded(null);
              }}
            >
              <Text style={{ color: tab === t ? colors.onPrimary : colors.textSecondary, fontWeight: '600' }}>
                {zh.tx[t]}
              </Text>
            </Pressable>
          ))}
        </View>
        <ScrollView contentContainerStyle={{ padding: 12 }}>
          {tab === 'expense' ? <Pressable disabled={organizing} onPress={onOrganize}
            style={{ padding: 14, borderRadius: 12, backgroundColor: colors.card, marginBottom: 12, opacity: organizing ? 0.5 : 1 }}>
            <Text style={{ color: colors.primary, fontWeight: '600' }}>{organization.title}</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 6 }}>{organization.hint}</Text>
          </Pressable> : null}
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
    </SecondarySheetScreen>
  );
}

function CategoryEditor({ type, editing, parentId, onClose }: {
  type: CategoryType;
  editing: Category | null;
  parentId: string | null;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const create = useCreateCategory();
  const update = useUpdateCategory();
  return (
    <IdentityEditor
      title={editing ? zh.categories.edit : zh.categories.add}
      initial={{ name: editing?.name ?? '', icon: resolveIconKey(editing?.icon, 'category'), color: editing?.color ?? (type === 'transfer' ? colors.transfer : COLOR_OPTIONS[0]!) }}
      icons={CATEGORY_ICON_KEYS}
      colors={COLOR_OPTIONS}
      placeholder={zh.categories.namePlaceholder}
      onClose={onClose}
      onSave={(input) => editing ? update.mutateAsync({ id: editing.id, input }) : create.mutateAsync({ ...input, type, parentId })}
    />
  );
}

const styles = StyleSheet.create({
  rowAction: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  segment: { flexDirection: 'row', margin: 12, borderRadius: 10, padding: 4 },
  segmentItem: { flex: 1, minHeight: 48, paddingVertical: 8, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  card: { borderRadius: 12, marginBottom: 8, overflow: 'hidden' },
  parentRow: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10 },
  childRow: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
