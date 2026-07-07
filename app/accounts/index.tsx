import { Stack, useRouter } from 'expo-router';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { totalAssets, useAccountBalances, useArchiveAccount } from '@/features/accounts';
import { zh } from '@/i18n/zh';
import { formatCentsWithSymbol } from '@/lib/money';
import { useTheme } from '@/theme';

export default function AccountsScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { data: accounts = [] } = useAccountBalances();
  const archive = useArchiveAccount();

  function confirmArchive(id: string, name: string) {
    Alert.alert(`${zh.accounts.archive}「${name}」`, zh.accounts.archiveConfirm, [
      { text: zh.common.cancel, style: 'cancel' },
      { text: zh.accounts.archive, style: 'destructive', onPress: () => archive.mutate(id) },
    ]);
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: zh.accounts.title,
          headerRight: () => (
            <Pressable onPress={() => router.push('/accounts/edit')} hitSlop={12}>
              <Text style={{ color: colors.primary, fontSize: 15 }}>{zh.accounts.add}</Text>
            </Pressable>
          ),
        }}
      />
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.background }}
        contentContainerStyle={{ padding: 16 }}
      >
        <View style={[styles.totalCard, { backgroundColor: colors.primary }]}>
          <Text style={styles.totalLabel}>{zh.accounts.totalAssets}</Text>
          <Text style={styles.totalValue}>{formatCentsWithSymbol(totalAssets(accounts))}</Text>
        </View>

        {accounts.length === 0 && (
          <Text style={{ color: colors.textSecondary, textAlign: 'center', marginTop: 24 }}>
            {zh.accounts.empty}
          </Text>
        )}

        {accounts.map((a) => (
          <Pressable
            key={a.id}
            style={[styles.row, { backgroundColor: colors.card }]}
            onPress={() => router.push({ pathname: '/accounts/edit', params: { id: a.id } })}
            onLongPress={() => confirmArchive(a.id, a.name)}
          >
            <View style={[styles.iconBox, { backgroundColor: `${a.color}33` }]}>
              <Text style={{ fontSize: 20 }}>{a.icon}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontSize: 15, fontWeight: '500' }}>{a.name}</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
                {zh.accounts.types[a.type]}
                {a.includeInTotal === 0 ? ` · 不${zh.accounts.includeInTotal}` : ''}
              </Text>
            </View>
            <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600' }}>
              {formatCentsWithSymbol(a.balance)}
            </Text>
          </Pressable>
        ))}
        <Text style={{ color: colors.textSecondary, fontSize: 12, textAlign: 'center', marginTop: 12 }}>
          长按账户可归档
        </Text>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  totalCard: { borderRadius: 14, padding: 20, marginBottom: 16 },
  totalLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 13 },
  totalValue: { color: '#FFFFFF', fontSize: 30, fontWeight: '700', marginTop: 6 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    gap: 12,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
