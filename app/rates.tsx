import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SecondarySheetScreen } from '@/components/navigation/secondary-sheet-screen';
import { SUPPORTED_CURRENCIES, useRates, useRefreshRates } from '@/features/currency';
import { dayjs } from '@/lib/date';
import { currencySymbol, formatRateToCNY } from '@/lib/money';
import { zh } from '@/i18n/zh';
import { useTheme } from '@/theme';

export default function RatesScreen() {
  const { colors } = useTheme();
  const { data } = useRates();
  const refresh = useRefreshRates();

  const fetchedAt = data?.fetchedAt ?? null;
  const rates = data?.rates ?? {};
  const rows = SUPPORTED_CURRENCIES.filter((c) => c !== 'CNY');

  return (
    <SecondarySheetScreen title={zh.profile.rates}>
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.background }}
        contentContainerStyle={{ padding: 16, gap: 16 }}
      >
        <Text style={[styles.hint, { color: colors.textSecondary }]}>{zh.currency.baseHint}</Text>

        <View style={[styles.statusRow, { borderColor: colors.border }]}>
          <Text style={{ color: colors.textSecondary, fontSize: 13, flex: 1 }}>
            {fetchedAt != null
              ? zh.currency.updatedAt(dayjs(fetchedAt).format('YYYY-MM-DD HH:mm'))
              : zh.currency.never}
          </Text>
          <Pressable
            style={[styles.refreshBtn, { backgroundColor: colors.primary, opacity: refresh.isPending ? 0.6 : 1 }]}
            disabled={refresh.isPending}
            onPress={() => refresh.mutate()}
          >
            <Text style={{ color: colors.onPrimary, fontSize: 14, fontWeight: '600' }}>
              {refresh.isPending ? zh.currency.refreshing : zh.currency.refresh}
            </Text>
          </Pressable>
        </View>
        {refresh.isError && (
          <Text style={{ color: colors.warning, fontSize: 12 }}>{zh.currency.refreshFailed}</Text>
        )}

        <View style={[styles.card, { backgroundColor: colors.card }]}>
          {rows.map((code, i) => (
            <View
              key={code}
              style={[
                styles.row,
                i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
              ]}
            >
              <Text style={[styles.sym, { color: colors.primary }]}>{currencySymbol(code)}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontSize: 15, fontWeight: '500' }}>{code}</Text>
                <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{zh.currencyNames[code]}</Text>
              </View>
              <Text style={{ color: colors.text, fontSize: 14 }}>
                {zh.currency.rateLabel(code)} {formatRateToCNY(rates[code])} {zh.currency.rateUnit}
              </Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </SecondarySheetScreen>
  );
}

const styles = StyleSheet.create({
  hint: { fontSize: 12, lineHeight: 18 },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  refreshBtn: { paddingHorizontal: 16, paddingVertical: 7, borderRadius: 8 },
  card: { borderRadius: 12, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  sym: { fontSize: 20, width: 40, textAlign: 'center' },
});
