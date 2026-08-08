import { useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SingleLineTextInput } from '@/components/single-line-text-input';
import {
  SecondarySheetScreen,
  SheetHeaderIconButton,
} from '@/components/navigation/secondary-sheet-screen';
import type { Project } from '@/db/schema';
import {
  useArchiveProject,
  useCreateProject,
  useProjects,
  useUpdateProject,
} from '@/features/projects';
import { Icon } from '@/components/Icon';
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
    Alert.alert(`${zh.projects.archive}「${p.name}」`, zh.projects.archiveConfirm, [
      { text: zh.common.cancel, style: 'cancel' },
      { text: zh.projects.archive, style: 'destructive', onPress: () => archive.mutate(p.id) },
    ]);
  }

  return (
    <SecondarySheetScreen
      title={zh.projects.title}
      headerRight={
        <SheetHeaderIconButton
          icon="plus"
          label={zh.projects.add}
          onPress={() => setEditor({ editing: null })}
        />
      }
    >
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <ScrollView contentContainerStyle={{ padding: 12 }}>
          {projects.length === 0 && (
            <Text style={{ color: colors.textSecondary, textAlign: 'center', marginTop: 24 }}>
              {zh.projects.empty}
            </Text>
          )}
          {projects.map((p) => (
            <View key={p.id} style={[styles.card, { backgroundColor: colors.card }]}>
              <View style={styles.row}>
                <IconBubble name={resolveIconKey(p.icon, 'category')} color={p.color} size={36} />
                <Text style={{ color: colors.text, fontSize: 15, fontWeight: '500', flex: 1 }}>
                  {p.name}
                </Text>
                <Pressable onPress={() => setEditor({ editing: p })} hitSlop={8}>
                  <Text style={{ color: colors.primary, fontSize: 13 }}>{zh.common.edit}</Text>
                </Pressable>
                <Pressable onPress={() => confirmArchive(p)} hitSlop={8}>
                  <Text style={{ color: colors.expense, fontSize: 13, marginLeft: 14 }}>
                    {zh.projects.archive}
                  </Text>
                </Pressable>
              </View>
            </View>
          ))}
        </ScrollView>
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
  const { colors } = useTheme();
  const [name, setName] = useState(editing?.name ?? '');
  const [icon, setIcon] = useState(resolveIconKey(editing?.icon, 'category'));
  const [color, setColor] = useState(editing?.color ?? COLOR_OPTIONS[0]!);
  const create = useCreateProject();
  const update = useUpdateProject();

  function handleSave() {
    if (!name.trim()) {
      Alert.alert(zh.projects.nameRequired);
      return;
    }
    const input = { name: name.trim(), icon, color };
    const done = { onSuccess: onClose };
    if (editing) {
      update.mutate({ id: editing.id, input }, done);
    } else {
      create.mutate(input, done);
    }
  }

  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: colors.card }]} onPress={() => {}}>
          <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600', marginBottom: 12 }}>
            {editing ? zh.projects.edit : zh.projects.add}
          </Text>
          <SingleLineTextInput
            style={[styles.input, { color: colors.text, borderColor: colors.border }]}
            value={name}
            onChangeText={setName}
            placeholder={zh.projects.namePlaceholder}
            placeholderTextColor={colors.textSecondary}
          />
          <View style={styles.chipRow}>
            {CATEGORY_ICON_KEYS.map((key) => (
              <Pressable
                key={key}
                style={[styles.iconChip, { borderColor: icon === key ? colors.primary : colors.border }]}
                onPress={() => setIcon(key)}
              >
                <Icon name={key} size={20} color={icon === key ? colors.primary : colors.text} />
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
            <Pressable style={[styles.btn, { backgroundColor: colors.border }]} onPress={onClose}>
              <Text style={{ color: colors.text, fontWeight: '600' }}>{zh.common.cancel}</Text>
            </Pressable>
            <Pressable style={[styles.btn, { backgroundColor: colors.primary }]} onPress={handleSave}>
              <Text style={{ color: colors.onPrimary, fontWeight: '600' }}>{zh.common.save}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 12, marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10 },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  sheet: { borderRadius: 14, padding: 16, width: '100%' },
  input: {
    height: 40,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
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
