import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { showDialog } from '@/components/dialog';
import { IdentityEditor } from '@/components/form/identity-editor';
import { FormActionBar } from '@/components/form/form-action-bar';
import {
  SecondarySheetScreen,
} from '@/components/navigation/secondary-sheet-screen';
import type { Project } from '@/db/schema';
import {
  useArchiveProject,
  useCreateProject,
  useProjects,
  useUpdateProject,
} from '@/features/projects';
import { IconBubble } from '@/components/IconBubble';
import { zh } from '@/i18n/zh';
import { CATEGORY_ICON_KEYS, resolveIconKey } from '@/lib/iconResolvers';
import { useTheme } from '@/theme';

const COLOR_OPTIONS = ['#F97316', '#3B82F6', '#EC4899', '#8B5CF6', '#06B6D4', '#EF4444', '#10B981', '#F59E0B', '#9CA3AF'];

export default function ProjectsScreen() {
  const { colors } = useTheme();
  const [editor, setEditor] = useState<{ editing: Project | null } | null>(null);
  const { data: projects = [] } = useProjects();
  const archive = useArchiveProject();

  function confirmArchive(p: Project) {
    showDialog(`${zh.projects.archive}「${p.name}」`, zh.projects.archiveConfirm, [
      { text: zh.common.cancel, style: 'cancel' },
      { text: zh.projects.archive, style: 'destructive', onPress: () => archive.mutate(p.id) },
    ]);
  }

  return (
    <SecondarySheetScreen
      title={zh.projects.title}
    >
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <ScrollView contentContainerStyle={{ padding: 12 }}>
          {projects.length === 0 && (
            <View style={{ alignItems: 'center', padding: 32, gap: 16 }}>
              <IconBubble name="briefcase" color={colors.primary} size={56} />
              <Text style={{ color: colors.textSecondary, textAlign: 'center', fontSize: 15 }}>{zh.common.empty}</Text>
            </View>
          )}
          {projects.map((p) => (
            <View key={p.id} style={[styles.card, { backgroundColor: colors.card }]}>
              <View style={styles.row}>
                <IconBubble name={resolveIconKey(p.icon, 'category')} color={p.color} size={36} />
                <Text style={{ color: colors.text, fontSize: 15, fontWeight: '500', flex: 1 }}>
                  {p.name}
                </Text>
                <Pressable accessibilityRole="button" accessibilityLabel={`${zh.common.edit} ${p.name}`} style={({ pressed }) => [styles.rowAction, { opacity: pressed ? 0.55 : 1 }]} onPress={() => setEditor({ editing: p })}>
                  <Text style={{ color: colors.text, fontSize: 14 }}>{zh.common.edit}</Text>
                </Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel={`${zh.projects.archive} ${p.name}`} style={({ pressed }) => [styles.rowAction, { opacity: pressed ? 0.55 : 1 }]} onPress={() => confirmArchive(p)}>
                  <Text style={{ color: colors.expense, fontSize: 14 }}>
                    {zh.projects.archive}
                  </Text>
                </Pressable>
              </View>
            </View>
          ))}
        </ScrollView>
        <FormActionBar label={zh.projects.add} icon="plus" onPress={() => setEditor({ editing: null })} keyboardAware={false} />
      </View>
      {editor && (
        <ProjectEditor
          editing={editor.editing}
          onClose={() => setEditor(null)}
        />
      )}
    </SecondarySheetScreen>
  );
}

function ProjectEditor({ editing, onClose }: { editing: Project | null; onClose: () => void }) {
  const create = useCreateProject();
  const update = useUpdateProject();
  return (
    <IdentityEditor
      title={editing ? zh.projects.edit : zh.projects.add}
      initial={{ name: editing?.name ?? '', icon: resolveIconKey(editing?.icon, 'category'), color: editing?.color ?? COLOR_OPTIONS[0]! }}
      icons={CATEGORY_ICON_KEYS}
      colors={COLOR_OPTIONS}
      placeholder={zh.projects.namePlaceholder}
      onClose={onClose}
      onSave={(input) => editing ? update.mutateAsync({ id: editing.id, input }) : create.mutateAsync(input)}
    />
  );
}

const styles = StyleSheet.create({
  rowAction: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  card: { borderRadius: 12, marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10 },
});
