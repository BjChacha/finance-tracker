import { Pressable, StyleSheet, Text, View } from "react-native";
import { Icon } from "@/components/Icon";
import { zh } from "@/i18n/zh";
import { dayjs } from "@/lib/date";
import { useTheme } from "@/theme";

const TIME_ACCESSIBILITY_LABEL = "\u65F6\u95F4";

type DateTimeSemanticCardsProps = {
	dateText: string;
	timeText: string;
	onPressDate: () => void;
	onPressTime: () => void;
};

export function DateTimeSemanticCards({
	dateText,
	timeText,
	onPressDate,
	onPressTime,
}: DateTimeSemanticCardsProps) {
	const { colors } = useTheme();
	const dateValue = dayjs(dateText, "YYYY-MM-DD").format("YYYY/MM/DD");

	return (
		<View style={styles.row}>
			<Pressable
				accessibilityRole="button"
				accessibilityLabel={`${zh.tx.date} ${dateText}`}
				style={({ pressed }) => [
					styles.card,
					styles.dateCard,
					{
						backgroundColor: colors.card,
						borderColor: pressed ? colors.primary : colors.border,
						opacity: pressed ? 0.86 : 1,
					},
				]}
				onPress={onPressDate}
			>
				<View style={[styles.icon, { backgroundColor: `${colors.primary}18` }]}>
					<Icon name="calendar" size={16} color={colors.primary} />
				</View>
				<Text numberOfLines={1} style={[styles.value, { color: colors.text }]}>
					{dateValue}
				</Text>
			</Pressable>

			<Pressable
				accessibilityRole="button"
				accessibilityLabel={`${TIME_ACCESSIBILITY_LABEL} ${timeText}`}
				style={({ pressed }) => [
					styles.card,
					styles.timeCard,
					{
						backgroundColor: colors.card,
						borderColor: pressed ? colors.primary : colors.border,
						opacity: pressed ? 0.86 : 1,
					},
				]}
				onPress={onPressTime}
			>
				<View style={[styles.icon, { backgroundColor: `${colors.primary}18` }]}>
					<Icon name="clock" size={16} color={colors.primary} />
				</View>
				<Text numberOfLines={1} style={[styles.value, { color: colors.text }]}>
					{timeText}
				</Text>
			</Pressable>
		</View>
	);
}

const styles = StyleSheet.create({
	row: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		marginBottom: 12,
	},
	card: {
		height: 50,
		flexDirection: "row",
		alignItems: "center",
		gap: 9,
		paddingHorizontal: 12,
		borderRadius: 12,
		borderCurve: "continuous",
		borderWidth: 1,
	},
	dateCard: { flex: 1.45, minWidth: 0 },
	timeCard: { flex: 0.75, minWidth: 108 },
	icon: {
		width: 26,
		height: 26,
		flexShrink: 0,
		borderRadius: 8,
		alignItems: "center",
		justifyContent: "center",
	},
	value: {
		flexShrink: 1,
		fontSize: 15,
		fontWeight: "600",
		fontVariant: ["tabular-nums"],
	},
});
