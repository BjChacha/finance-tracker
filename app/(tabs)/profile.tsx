import { useRouter, type Href } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { zh } from '@/i18n/zh';
import { useTheme } from '@/theme';

type Entry = { icon: string; label: string; href: Href | null };

export default function ProfileScreen() {
  const { colors } = useTheme();
  const router = useRouter();

  const entries: Entry[] = [
    { icon: '💳', label: zh.profile.accounts, href: '/accounts' },
    { icon: '🏷️', label: zh.profile.categories, href: '/categories' },
    { icon: '☁️', label: zh.profile.backup, href: null },
    { icon: '📥', label: zh.profile.import, href: null },
    { icon: '🔁', label: zh.profile.recurring, href: null },
  ];

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: 16 }}
    >
      <View style={[styles.card, { backgroundColor: colors.card }]}>
        {entries.map((entry, i) => {
          const disabled = entry.href === null;
          return (
            <Pressable
              key={entry.label}
              style={[
                styles.row,
                i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
                disabled && { opacity: 0.4 },
              ]}
              disabled={disabled}
              onPress={() => entry.href && router.push(entry.href)}
            >
              <Text style={{ fontSize: 20 }}>{entry.icon}</Text>
              <Text style={{ color: colors.text, fontSize: 15, flex: 1 }}>{entry.label}</Text>
              {disabled ? (
                <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                  {zh.profile.comingSoon}
                </Text>
              ) : (
                <Text style={{ color: colors.textSecondary }}>›</Text>
              )}
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 12, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 15,
  },
});
