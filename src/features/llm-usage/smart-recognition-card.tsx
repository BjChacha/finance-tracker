import { StyleSheet, Text, View } from "react-native";
import { zh } from "@/i18n/zh";
import { useTheme } from "@/theme";
import { useSmartRecognitionSummary } from "./hooks";
import { formatCostYuan } from "./pricing";

/** Groups an integer with thousands separators (Hermes lacks full Intl grouping). */
function groupDigits(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * 识别生成占比：分母是全部交易数。没有交易时给「—」；不足 10% 时保留一位小数，
 * 否则 1/300 这样的比例会被四舍五入成 0%。
 */
export function formatSharePercent(generated: number, transactions: number): string {
  if (!(transactions > 0)) return "—";
  const percent = Math.min(100, Math.max(0, (generated / transactions) * 100));
  return percent >= 10 ? `${Math.round(percent)}%` : `${percent.toFixed(1)}%`;
}

/**
 * 「智能识别」统计卡：识别生成过多少笔交易、占全部交易的比例，以及识别本身花了多少。
 *
 * 花费只算识别调用（`llm_usage.source='nl'`）——消费报告生成是另一笔显式开销，
 * 单独在报告页展示，不混进这张卡。
 */
export function SmartRecognitionCard() {
  const { colors } = useTheme();
  const { data } = useSmartRecognitionSummary();
  const month = data?.month;
  const total = data?.total;
  const hasUsage = (total?.calls ?? 0) > 0;
  const generated = data?.generated ?? 0;
  const cells = [
    {
      label: zh.profile.smartGenerated,
      value: `${groupDigits(generated)} ${zh.profile.smartCountUnit}`,
    },
    {
      label: zh.profile.smartShare,
      value: formatSharePercent(generated, data?.transactions ?? 0),
    },
    {
      label: zh.profile.smartMonthCost,
      value: hasUsage ? formatCostYuan(month?.costMicros ?? 0) : "—",
    },
    {
      label: zh.profile.smartTotalCost,
      value: hasUsage ? formatCostYuan(total?.costMicros ?? 0) : "—",
    },
  ];
  const tokens = (total?.promptTokens ?? 0) + (total?.completionTokens ?? 0);
  return (
    <View>
      <Text style={[styles.groupTitle, { color: colors.textSecondary }]}>
        {zh.profile.smartTitle}
      </Text>
      <View style={[styles.card, { backgroundColor: colors.card }]}>
        <View style={styles.cells}>
          {cells.map((cell, index) => (
            <View
              key={cell.label}
              style={[
                styles.cell,
                index > 0 && {
                  borderLeftWidth: StyleSheet.hairlineWidth,
                  borderLeftColor: colors.border,
                },
              ]}
            >
              <Text style={[styles.cellLabel, { color: colors.textSecondary }]}>
                {cell.label}
              </Text>
              <Text
                style={[styles.cellValue, { color: colors.text }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.6}
              >
                {cell.value}
              </Text>
            </View>
          ))}
        </View>
        <Text style={[styles.footnote, { color: colors.textSecondary }]}>
          {hasUsage
            ? `${zh.profile.smartCalls} ${groupDigits(total?.calls ?? 0)} · ${zh.profile.smartTokens} ${groupDigits(tokens)}`
            : zh.profile.smartEmpty}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  groupTitle: { fontSize: 13, fontWeight: "600", marginBottom: 8, marginLeft: 4 },
  card: { borderRadius: 12, overflow: "hidden" },
  cells: { flexDirection: "row", paddingVertical: 14 },
  cell: { flex: 1, alignItems: "center", gap: 4, paddingHorizontal: 4 },
  cellLabel: { fontSize: 11 },
  cellValue: {
    fontSize: 14,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  footnote: {
    fontSize: 11,
    textAlign: "center",
    paddingBottom: 12,
    paddingHorizontal: 12,
  },
});
