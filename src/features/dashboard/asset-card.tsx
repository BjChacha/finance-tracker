import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { TrendLineChart } from '@/features/stats/charts/TrendLineChart';
import { useAssetHistory } from '@/features/stats/hooks';
import type { TrendGranularity } from '@/features/stats/transform';
import { transactionParams } from '@/features/transactions/filters';
import type { DateRange } from '@/lib/analytics-range';
import { dayjs } from '@/lib/date';
import { formatCentsWithSymbol } from '@/lib/money';
import { useTheme } from '@/theme';
import {
  Amount,
  Card,
  dashboardStyles,
  QueryNotice,
  TextAction,
} from './components';
import { dashboardText as copy } from './labels';

export function AssetCard({
  range,
  granularity,
  onDetails,
  detail = false,
  enabled = true,
}: {
  range: DateRange;
  granularity: TrendGranularity;
  onDetails?: () => void;
  detail?: boolean;
  enabled?: boolean;
}) {
  const { colors } = useTheme();
  const router = useRouter();
  const query = useAssetHistory(range, granularity, enabled);
  const [metric, setMetric] = useState<'netWorth' | 'assets' | 'liabilities'>(
    'netWorth',
  );
  const data = query.data;
  return (
    <>
      <Card
        title={copy.assetChanges}
        action={
          onDetails && (
            <TextAction label={copy.assetDetails} onPress={onDetails} />
          )
        }
      >
        <QueryNotice queries={[query]} />
        {data && (
          <>
            <View style={dashboardStyles.row}>
              {(['netWorth', 'assets', 'liabilities'] as const).map((key) => (
                <Pressable
                  key={key}
                  accessibilityRole="button"
                  accessibilityState={{ selected: key === metric }}
                  onPress={() => setMetric(key)}
                  style={{
                    flex: 1,
                    paddingVertical: 10,
                    borderBottomWidth: 2,
                    borderBottomColor:
                      key === metric ? colors.primary : colors.border,
                  }}
                >
                  <Text
                    style={{
                      textAlign: 'center',
                      color:
                        key === metric ? colors.text : colors.textSecondary,
                      fontSize: 13,
                    }}
                  >
                    {copy[key]}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Amount
              label={`${copy.closing} · ${range.end}`}
              value={data.closing[metric]}
              large
            />
            <View style={dashboardStyles.row}>
              <Amount label={copy.opening} value={data.opening[metric]} />
              <Amount
                label={copy.change}
                value={data.closing[metric] - data.opening[metric]}
              />
            </View>
            <TrendLineChart
              points={data.points.map((point, index) => ({
                label:
                  index === 0
                    ? copy.openingPoint
                    : dayjs(point.dateKey).format(
                        granularity === 'month' ? 'YY.MM' : 'M.D',
                      ),
                detailLabel: point.dateKey,
                primary: point[metric],
              }))}
              primaryColor={colors.primary}
              primaryLabel={copy[metric]}
              curved={false}
              height={180}
            />
            {data.accounts.length === 0 && (
              <Text style={{ color: colors.textSecondary }}>
                {copy.noAccounts}
              </Text>
            )}
          </>
        )}
        <TextAction
          label={copy.accounts}
          onPress={() => router.push('/accounts')}
        />
        <Text
          style={{ color: colors.textSecondary, fontSize: 11, lineHeight: 18 }}
        >
          {copy.historyNote}
        </Text>
      </Card>
      {detail && data && (
        <Card title={copy.accountChanges}>
          {data.accounts.map((account) => (
            <Pressable
              key={account.id}
              accessibilityRole="button"
              onPress={() =>
                router.push({
                  pathname: '/transactions',
                  params: transactionParams(
                    { range, accountId: account.id },
                    account.name,
                  ),
                })
              }
              style={{
                gap: 6,
                paddingVertical: 8,
                borderBottomWidth: 1,
                borderBottomColor: colors.border,
              }}
            >
              <View style={dashboardStyles.between}>
                <Text
                  style={{ color: colors.text, fontWeight: '600', flex: 1 }}
                >
                  {account.name}
                </Text>
                <Text
                  style={{
                    color:
                      account.changeBase < 0 ? colors.expense : colors.income,
                  }}
                >
                  {account.changeBase > 0 ? '+' : ''}
                  {formatCentsWithSymbol(account.changeBase)}
                </Text>
              </View>
              <Text style={{ fontSize: 12, color: colors.textSecondary }}>
                {formatCentsWithSymbol(account.opening, account.currency)} →{' '}
                {formatCentsWithSymbol(account.closing, account.currency)}
              </Text>
            </Pressable>
          ))}
        </Card>
      )}
    </>
  );
}
