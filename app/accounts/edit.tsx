import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { AccountType } from '@/db/schema';
import {
  useAccountBalances,
  useCreateAccount,
  useUpdateAccount,
  type AccountInput,
} from '@/features/accounts';
import { zh } from '@/i18n/zh';
import { formatCents, parseMoneyToCents } from '@/lib/money';
import { useTheme } from '@/theme';

const ACCOUNT_TYPES: AccountType[] = ['cash', 'bank', 'alipay', 'wechat', 'credit', 'other'];
const ICON_OPTIONS = ['💵', '🏦', '💳', '📱', '💰', '🪙', '💎', '🧧'];
const COLOR_OPTIONS = ['#10B981', '#3B82F6', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#9CA3AF'];

export default function AccountEditScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const { data: accounts = [] } = useAccountBalances();
  const existing = id ? accounts.find((a) => a.id === id) : undefined;

  const [name, setName] = useState(existing?.name ?? '');
  const [type, setType] = useState<AccountType>(existing?.type ?? 'cash');
  const [icon, setIcon] = useState(existing?.icon ?? '💵');
  const [color, setColor] = useState(existing?.color ?? '#10B981');
  const [balanceText, setBalanceText] = useState(
    existing ? formatCents(existing.initialBalance, { grouping: false }) : '0',
  );
  const [includeInTotal, setIncludeInTotal] = useState(
    existing ? existing.includeInTotal === 1 : true,
  );

  const create = useCreateAccount();
  const update = useUpdateAccount();
  const pending = create.isPending || update.isPending;

  function handleSave() {
    if (!name.trim()) {
      Alert.alert(zh.accounts.nameRequired);
      return;
    }
    const initialBalance = parseMoneyToCents(balanceText || '0');
    if (initialBalance === null) {
      Alert.alert(zh.accounts.invalidBalance);
      return;
    }
    const input: AccountInput = { name: name.trim(), type, icon, color, initialBalance, includeInTotal };
    const done = { onSuccess: () => router.back() };
    if (existing) update.mutate({ id: existing.id, input }, done);
    else create.mutate(input, done);
  }

  return (
    <>
      <Stack.Screen options={{ title: existing ? zh.accounts.edit : zh.accounts.add }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.background }}
        contentContainerStyle={{ padding: 16 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>{zh.accounts.name}</Text>
          <TextInput
            style={[styles.input, { color: colors.text, borderColor: colors.border }]}
            value={name}
            onChangeText={setName}
            placeholder={zh.accounts.namePlaceholder}
            placeholderTextColor={colors.textSecondary}
          />

          <Text style={[styles.label, { color: colors.textSecondary }]}>{zh.accounts.type}</Text>
          <View style={styles.chipRow}>
            {ACCOUNT_TYPES.map((t) => (
              <Pressable
                key={t}
                style={[
                  styles.chip,
                  { borderColor: colors.border },
                  type === t && { backgroundColor: colors.primary, borderColor: colors.primary },
                ]}
                onPress={() => setType(t)}
              >
                <Text style={{ color: type === t ? '#FFFFFF' : colors.text, fontSize: 13 }}>
                  {zh.accounts.types[t]}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={[styles.label, { color: colors.textSecondary }]}>{zh.accounts.icon}</Text>
          <View style={styles.chipRow}>
            {ICON_OPTIONS.map((i) => (
              <Pressable
                key={i}
                style={[
                  styles.iconChip,
                  { borderColor: icon === i ? colors.primary : colors.border },
                ]}
                onPress={() => setIcon(i)}
              >
                <Text style={{ fontSize: 20 }}>{i}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={[styles.label, { color: colors.textSecondary }]}>{zh.accounts.color}</Text>
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

          <Text style={[styles.label, { color: colors.textSecondary }]}>
            {zh.accounts.initialBalance}
          </Text>
          <TextInput
            style={[styles.input, { color: colors.text, borderColor: colors.border }]}
            value={balanceText}
            onChangeText={setBalanceText}
            keyboardType="numbers-and-punctuation"
            placeholder="0.00"
            placeholderTextColor={colors.textSecondary}
          />

          <View style={styles.switchRow}>
            <Text style={{ color: colors.text, fontSize: 15 }}>{zh.accounts.includeInTotal}</Text>
            <Switch
              value={includeInTotal}
              onValueChange={setIncludeInTotal}
              trackColor={{ true: colors.primary }}
            />
          </View>
        </View>

        <Pressable
          style={[styles.saveBtn, { backgroundColor: colors.primary, opacity: pending ? 0.6 : 1 }]}
          onPress={handleSave}
          disabled={pending}
        >
          <Text style={styles.saveBtnText}>{zh.common.save}</Text>
        </Pressable>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 12, padding: 16, marginBottom: 16 },
  label: { fontSize: 13, marginBottom: 8, marginTop: 14 },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 15,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, borderWidth: 1 },
  iconChip: {
    width: 42,
    height: 42,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorDot: { width: 32, height: 32, borderRadius: 16 },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 18,
  },
  saveBtn: { borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  saveBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
});
