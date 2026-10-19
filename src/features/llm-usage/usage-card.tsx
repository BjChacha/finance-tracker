import { StyleSheet, Text, View } from "react-native";
import { zh } from "@/i18n/zh";
import { useTheme } from "@/theme";
import { useLLMUsageSummary } from "./hooks";
import { formatCostYuan } from "./pricing";

/** Groups an integer with thousands separators (Hermes lacks full Intl grouping). */
function groupDigits(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** Spend of the natural-language entry, shown on the profile tab next to the bookkeeping summary. */
export function LLMUsageCard() {
  const { colors } = useTheme();
  const { data } = useLLMUsageSummary();
  const month = data?.month;
  const total = data?.total;
  const hasUsage = (total?.calls ?? 0) > 0;
  const cells = [
    {
      label: zh.profile.llmUsageMonth,
      value: hasUsage ? formatCostYuan(month?.costMicros ?? 0) : "—",
    },
    {
      label: zh.profile.llmUsageTotal,
      value: hasUsage ? formatCostYuan(total?.costMicros ?? 0) : "—",
    },
    {
      label: zh.profile.llmUsageCalls,
      value: total ? groupDigits(total.calls) : "—",
    },
  ];
  const tokens = (total?.promptTokens ?? 0) + (total?.completionTokens ?? 0);
  return (
    <View>
      <Text style={[styles.groupTitle, { color: colors.textSecondary }]}>
        {zh.profile.llmUsageTitle}
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
            ? `${zh.profile.llmUsageTokens} ${groupDigits(tokens)} · ${zh.profile.llmUsageSubtitle}`
            : zh.profile.llmUsageEmpty}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  groupTitle: { fontSize: 13, fontWeight: "600", marginBottom: 8, marginLeft: 4 },
  card: { borderRadius: 12, overflow: "hidden" },
  cells: { flexDirection: "row", paddingVertical: 14 },
  cell: { flex: 1, alignItems: "center", gap: 4, paddingHorizontal: 6 },
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
