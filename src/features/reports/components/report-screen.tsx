import { useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import {
  Card,
  dashboardStyles,
  PeriodControl,
  QueryNotice,
  TextAction,
} from '@/features/dashboard/components';
import { usePeriod } from '@/features/dashboard/use-period';
import { ParseError, type ParseFailure } from '@/features/llm/chat';
import { formatCostYuan } from '@/features/llm-usage/pricing';
import { dayjs } from '@/lib/date';
import { formatCentsWithSymbol } from '@/lib/money';
import { useTheme } from '@/theme';
import type { ReportAnalysis, ReportAnalysisItem } from '../analysis-contract';
import { EmptyPeriodError } from '../generate';
import { useGenerateReport, useReportSnapshot, useStoredReport } from '../hooks';
import { reportsText as copy } from '../labels';
import type { ReportSnapshot } from '../snapshot';

function changeLabel(pct: number | null): string {
  if (pct === null) return '—';
  return `${pct > 0 ? '+' : ''}${pct}%`;
}

function failureLabel(failure: ParseFailure): string {
  switch (failure) {
    case 'missing_key':
      return copy.missingKey;
    case 'unauthorized':
      return copy.unauthorized;
    case 'rate_limited':
      return copy.rateLimited;
    case 'timeout':
      return copy.timeout;
    case 'server':
      return copy.server;
    case 'network':
      return copy.network;
    default:
      return copy.invalidResponse;
  }
}

function generateErrorLabel(error: unknown): string {
  if (error instanceof EmptyPeriodError) return copy.emptyPeriod;
  if (error instanceof ParseError) return failureLabel(error.failure);
  return copy.failed;
}

function Metric({
  label,
  value,
  color,
  large = false,
}: {
  label: string;
  value: string;
  color?: string;
  large?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ flexGrow: 1, flexShrink: 1, minWidth: 0, gap: 4 }}>
      <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{label}</Text>
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        style={[
          dashboardStyles.number,
          { color: color ?? colors.text, fontSize: large ? 26 : 16 },
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

function CategoryBars({ rows }: { rows: ReportSnapshot['categories'] }) {
  const { colors } = useTheme();
  const max = Math.max(...rows.map((row) => row.totalCents), 1);
  return (
    <View style={{ gap: 10 }}>
      {rows.map((row, index) => (
        <View key={`${row.name}-${index}`} style={{ gap: 5 }}>
          <View style={dashboardStyles.between}>
            <Text
              numberOfLines={1}
              style={{ flex: 1, color: colors.text, fontSize: 13 }}
            >
              {row.name}
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
              {formatCentsWithSymbol(row.totalCents)} · {row.pct}%
            </Text>
          </View>
          <View
            style={{
              height: 6,
              borderRadius: 3,
              backgroundColor: colors.border,
              overflow: 'hidden',
            }}
          >
            <View
              style={{
                width: `${Math.max((row.totalCents / max) * 100, 2)}%`,
                height: 6,
                borderRadius: 3,
                backgroundColor: colors.primary,
              }}
            />
          </View>
        </View>
      ))}
    </View>
  );
}

function AnalysisItems({
  title,
  items,
}: {
  title: string;
  items: ReportAnalysisItem[];
}) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: 10 }}>
      <Text style={{ color: colors.text, fontSize: 14, fontWeight: '600' }}>
        {title}
      </Text>
      {items.map((item, index) => (
        <View key={`${title}-${index}`} style={{ gap: 2 }}>
          <Text style={{ color: colors.text, fontSize: 13, fontWeight: '600' }}>
            {index + 1}. {item.title}
          </Text>
          <Text
            style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 18 }}
          >
            {item.detail}
          </Text>
        </View>
      ))}
    </View>
  );
}

function AnalysisBody({
  analysis,
  generatedAt,
  model,
  costMicros,
  onRegenerate,
  regenerating,
}: {
  analysis: ReportAnalysis;
  generatedAt: number;
  model: string;
  costMicros: number;
  onRegenerate: () => void;
  regenerating: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: 16 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {analysis.styleTags.map((tag, index) => (
          <View
            key={`${tag}-${index}`}
            style={{
              paddingHorizontal: 10,
              paddingVertical: 5,
              borderRadius: 999,
              backgroundColor: colors.border,
            }}
          >
            <Text style={{ color: colors.text, fontSize: 12 }}>{tag}</Text>
          </View>
        ))}
      </View>
      <Text style={{ color: colors.text, fontSize: 15, lineHeight: 22 }}>
        {analysis.spendingStyle}
      </Text>
      <AnalysisItems title={copy.insights} items={analysis.insights} />
      <AnalysisItems title={copy.suggestions} items={analysis.suggestions} />
      <View style={{ gap: 4 }}>
        <Text style={{ color: colors.textSecondary, fontSize: 11 }}>
          {copy.generatedAt} {dayjs(generatedAt).format('YYYY-MM-DD HH:mm')} ·{' '}
          {copy.modelLabel} {model} · {formatCostYuan(costMicros)}
        </Text>
        <Text style={{ color: colors.textSecondary, fontSize: 11 }}>
          {copy.regenerateHint}
        </Text>
      </View>
      {regenerating ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <ActivityIndicator color={colors.primary} />
          <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
            {copy.generating}
          </Text>
        </View>
      ) : (
        <TextAction label={copy.regenerate} onPress={onRegenerate} />
      )}
    </View>
  );
}

/**
 * Local aggregates render without a network call; the AI section is the only billed part and is
 * generated explicitly. Both read from the same redacted snapshot.
 */
export function ReportScreen() {
  const period = usePeriod(useLocalSearchParams());
  const { selection, range } = period;
  const snapshot = useReportSnapshot(selection);
  const stored = useStoredReport(selection);
  const generate = useGenerateReport();
  const { colors } = useTheme();
  const data = snapshot.data;
  const generationInFlight =
    generate.isPending &&
    generate.variables?.period === selection.period &&
    generate.variables.key === selection.key;
  const generationError =
    generate.isError &&
    generate.variables?.period === selection.period &&
    generate.variables.key === selection.key
      ? generate.error
      : null;
  const isEmpty = Boolean(
    data && data.totals.expenseCount === 0 && data.totals.incomeCents === 0,
  );
  const regenerate = () => generate.mutate(selection);

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[dashboardStyles.content, { paddingBottom: 40 }]}
    >
      <PeriodControl {...period} />
      <View style={dashboardStyles.between}>
        <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
          {range.start} — {range.end}
        </Text>
        {data?.isPartial && (
          <Text style={{ color: colors.textSecondary, fontSize: 11 }}>
            {copy.partial}
          </Text>
        )}
      </View>

      <Card title={copy.summary}>
        <QueryNotice queries={[snapshot]} />
        {data && (
          <>
            <View style={dashboardStyles.row}>
              <Metric
                label={copy.totalExpense}
                value={formatCentsWithSymbol(data.totals.expenseCents)}
                color={colors.expense}
                large
              />
              <Metric
                label={copy.totalIncome}
                value={formatCentsWithSymbol(data.totals.incomeCents)}
                color={colors.income}
              />
            </View>
            <View style={dashboardStyles.row}>
              <Metric
                label={copy.net}
                value={formatCentsWithSymbol(data.totals.netCents)}
                color={
                  data.totals.netCents >= 0 ? colors.income : colors.expense
                }
              />
              <Metric
                label={copy.savingsRate}
                value={
                  data.totals.savingsRatePct === null
                    ? '—'
                    : `${data.totals.savingsRatePct}%`
                }
              />
            </View>
            <View style={dashboardStyles.row}>
              <Metric
                label={copy.expenseCount}
                value={String(data.totals.expenseCount)}
              />
              <Metric
                label={copy.dailyAverage}
                value={formatCentsWithSymbol(data.totals.dailyAverageCents)}
              />
              <Metric
                label={copy.largestExpense}
                value={formatCentsWithSymbol(data.totals.largestExpenseCents)}
              />
            </View>
            <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
              {copy.versusPrevious}{' '}
              {changeLabel(data.comparison.expenseChangePct)}
            </Text>
          </>
        )}
      </Card>

      {data && data.categories.length > 0 && (
        <Card title={copy.topCategories}>
          <CategoryBars rows={data.categories} />
        </Card>
      )}

      <Card title={copy.analysis}>
        <QueryNotice queries={[stored]} />
        {stored.data ? (
          <AnalysisBody
            analysis={stored.data.analysis}
            generatedAt={stored.data.generatedAt}
            model={stored.data.model}
            costMicros={stored.data.costMicros}
            onRegenerate={regenerate}
            regenerating={generationInFlight}
          />
        ) : stored.isSuccess ? (
          <View style={{ gap: 12 }}>
            {isEmpty ? (
              <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
                {copy.empty}
              </Text>
            ) : (
              <>
                <Text
                  style={{
                    color: colors.textSecondary,
                    fontSize: 12,
                    lineHeight: 18,
                  }}
                >
                  {copy.privacy}
                </Text>
                {generationError && (
                  <Text
                    accessibilityRole="alert"
                    style={{ color: colors.expense, fontSize: 12 }}
                  >
                    {generateErrorLabel(generationError)}
                  </Text>
                )}
                {generationInFlight ? (
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 10,
                      paddingVertical: 8,
                    }}
                  >
                    <ActivityIndicator color={colors.primary} />
                    <Text
                      style={{ color: colors.textSecondary, fontSize: 13 }}
                    >
                      {copy.generating}
                    </Text>
                  </View>
                ) : (
                  <Pressable
                    accessibilityRole="button"
                    onPress={regenerate}
                    style={{
                      minHeight: 44,
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: 12,
                      backgroundColor: colors.primary,
                    }}
                  >
                    <Text
                      style={{ color: colors.onPrimary, fontWeight: '600' }}
                    >
                      {copy.generate}
                    </Text>
                  </Pressable>
                )}
              </>
            )}
          </View>
        ) : null}
      </Card>
    </ScrollView>
  );
}
