import {
	forwardRef,
	useEffect,
	useImperativeHandle,
	useLayoutEffect,
	useRef,
	useState,
	type ForwardedRef,
} from "react";
import {
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { showDialog } from '@/components/dialog';
import Animated, {
	Easing,
	FadeIn,
	FadeOut,
	ReduceMotion,
	SlideInUp,
	SlideOutDown,
} from "react-native-reanimated";
import { Icon } from "@/components/Icon";
import { FormActionBar } from "@/components/form/form-action-bar";
import { confirmDiscard } from "@/components/form/confirm-discard";
import { formLabels } from "@/components/form/labels";
import { SingleLineTextInput } from "@/components/single-line-text-input";
import { ACCOUNT_TYPES, normalizeAccountType } from "@/db/account-types";
import type { AccountType } from "@/db/schema";
import { AmountKeypadPanel } from "@/features/transactions/components/AmountKeypadPanel";
import { zh } from "@/i18n/zh";
import { applyCalcInput, evalMoneyExpr } from "@/lib/calc";
import { ACCOUNT_ICON_KEYS, resolveIconKey } from "@/lib/iconResolvers";
import {
	currencySymbol,
	formatCents,
	formatCentsWithSymbol,
	parseMoneyToCents,
} from "@/lib/money";
import { isQuickKeypadAvailable, openKeypad } from "@/lib/quickKeypad";
import { useProgressiveMount } from "@/lib/use-progressive-mount";
import { motion, useTheme } from "@/theme";
import { planAdjustment } from "../adjustment";
import {
	useAccountBalances,
	useAdjustAccountBalance,
	useCreateAccount,
	useUpdateAccountDetails,
} from "../hooks";
import type { AccountDetailsInput, AccountInput } from "../repository";

const COLOR_OPTIONS = [
	"#10B981",
	"#3B82F6",
	"#F59E0B",
	"#EF4444",
	"#8B5CF6",
	"#EC4899",
	"#06B6D4",
	"#9CA3AF",
];

interface AccountEditorProps {
	accountId?: string;
	renderMode?: "summary" | "staged-editor" | "editor";
	sessionKey?: string | number | null;
	onSessionHydrated?: (sessionKey: string | number) => void;
	onEditorReady?: () => void;
	onComplete: () => void;
}

export interface AccountEditorHandle {
	handleBackPress: () => boolean;
	/** Prepare dismiss: close adjust sheet/keyboard. No longer auto-saves; returns true. */
	prepareDismiss: () => Promise<boolean>;
	/** Submit account details (edit only). Closes overlays first; returns true on success. */
	save: () => Promise<boolean>;
}

function AccountEditorComponent(
	{
		accountId,
		renderMode = "editor",
		sessionKey = null,
		onSessionHydrated,
		onEditorReady,
		onComplete,
	}: AccountEditorProps,
	ref: ForwardedRef<AccountEditorHandle>,
) {
	const { colors } = useTheme();
	const progressiveEditorStage = useProgressiveMount(
		renderMode === "staged-editor",
		10,
		4,
	);
	const editorStage =
		renderMode === "summary"
			? 0
			: renderMode === "staged-editor"
				? progressiveEditorStage
				: 10;
	const { data: accounts = [] } = useAccountBalances();
	const existing = accountId
		? accounts.find((account) => account.id === accountId)
		: undefined;

	const [name, setName] = useState(existing?.name ?? "");
	const [type, setType] = useState<AccountType>(
		normalizeAccountType(existing?.type ?? "cash"),
	);
	const [icon, setIcon] = useState(resolveIconKey(existing?.icon, "account"));
	const [color, setColor] = useState(existing?.color ?? "#10B981");
	const [balanceText, setBalanceText] = useState(
		existing ? formatCents(existing.initialBalance, { grouping: false }) : "0",
	);
	const [includeInTotal, setIncludeInTotal] = useState(
		existing ? existing.includeInTotal === 1 : true,
	);
	const [adjustOpen, setAdjustOpen] = useState(false);
	const [keyboardVisible, setKeyboardVisible] = useState(false);
	const [keyboardHeight, setKeyboardHeight] = useState(0);
	const submissionLock = useRef(false);
	const [adjustText, setAdjustText] = useState("");
	const replaceBalanceOnNextNumericRef = useRef(false);
	const hydratedAccountIdRef = useRef<string | number | null>(null);
	const bypassDismissGateRef = useRef(false);
	const scrollRef = useRef<ScrollView>(null);
	const reportedSessionKeyRef = useRef<string | number | null>(null);
	const [hydratedSessionKey, setHydratedSessionKey] = useState<
		string | number | null
	>(null);
	const editorReadyReportedRef = useRef(false);

	const currency = existing?.currency ?? "CNY";
	const headerBalance = existing
		? existing.balance
		: (parseMoneyToCents(balanceText) ?? 0);
	const mountedAccountTypeCount =
		editorStage < 2 ? 0 : Math.min(ACCOUNT_TYPES.length, (editorStage - 1) * 3);
	const mountedIconCount =
		editorStage < 5
			? 0
			: Math.min(ACCOUNT_ICON_KEYS.length, (editorStage - 4) * 3);
	useLayoutEffect(() => {
		const hydrationKey = sessionKey ?? existing?.id ?? null;
		if (
			!existing ||
			hydrationKey === null ||
			hydratedAccountIdRef.current === hydrationKey
		)
			return;
		hydratedAccountIdRef.current = hydrationKey;
		reportedSessionKeyRef.current = null;
		bypassDismissGateRef.current = false;
		setName(existing.name);
		setType(normalizeAccountType(existing.type));
		setIcon(resolveIconKey(existing.icon, "account"));
		setColor(existing.color);
		setBalanceText(formatCents(existing.initialBalance, { grouping: false }));
		setIncludeInTotal(existing.includeInTotal === 1);
		setAdjustOpen(false);
		setKeyboardVisible(false);
		setAdjustText("");
		replaceBalanceOnNextNumericRef.current = false;
		Keyboard.dismiss();
		scrollRef.current?.scrollTo({ y: 0, animated: false });
		if (sessionKey !== null) setHydratedSessionKey(sessionKey);
	}, [existing, sessionKey]);

	useLayoutEffect(() => {
		if (
			sessionKey === null ||
			hydratedSessionKey !== sessionKey ||
			reportedSessionKeyRef.current === sessionKey
		) {
			return;
		}
		reportedSessionKeyRef.current = sessionKey;
		onSessionHydrated?.(sessionKey);
	}, [hydratedSessionKey, onSessionHydrated, sessionKey]);

	useLayoutEffect(() => {
		if (editorStage < 10 || editorReadyReportedRef.current) return;
		editorReadyReportedRef.current = true;
		onEditorReady?.();
	}, [editorStage, onEditorReady]);

	useEffect(() => {
		const showSubscription = Keyboard.addListener("keyboardDidShow", (event) => {
			setKeyboardVisible(true);
			setKeyboardHeight(event.endCoordinates.height);
		});
		const hideSubscription = Keyboard.addListener("keyboardDidHide", () => {
			setKeyboardVisible(false);
			setKeyboardHeight(0);
		});
		return () => {
			showSubscription.remove();
			hideSubscription.remove();
		};
	}, []);

	const create = useCreateAccount();
	const updateDetails = useUpdateAccountDetails();
	const adjust = useAdjustAccountBalance();
	const pending = create.isPending || adjust.isPending || updateDetails.isPending;
	const dirty = existing ? name.trim() !== existing.name || type !== normalizeAccountType(existing.type) || icon !== resolveIconKey(existing.icon, "account") || color !== existing.color || includeInTotal !== (existing.includeInTotal === 1) : name.trim().length > 0;

	const details: AccountDetailsInput | null =
		existing && name.trim()
			? { name: name.trim(), type, icon, color, includeInTotal }
			: null;

	useImperativeHandle(
		ref,
		() => ({
			handleBackPress: () => {
				if (!adjustOpen) return false;
				setAdjustOpen(false);
				return true;
			},
			prepareDismiss: async () => {
				if (bypassDismissGateRef.current) return true;
				if (submissionLock.current || pending) return false;
				if (adjustOpen) {
					setAdjustOpen(false);
					return false;
				}
				if (keyboardVisible) {
					Keyboard.dismiss();
					return false;
				}
				return dirty ? confirmDiscard() : true;
			},
			save,
		}),
	);

	async function openBalanceKeypad(): Promise<void> {
		const value = existing
			? existing.balance
			: (parseMoneyToCents(balanceText) ?? 0);
		if (Platform.OS === "android" && isQuickKeypadAvailable()) {
			try {
				const result = await openKeypad({
					initialAmountCents: value,
					initialCurrency: currency,
					allowCurrencySelection: false,
					allowZero: true,
				});
				if (result) applyAdjustValue(result.amountCents);
				return;
			} catch {
				// Preserve the React keypad fallback when the native bridge fails.
			}
		}

		setAdjustText(formatCents(value, { grouping: false }));
		replaceBalanceOnNextNumericRef.current = true;
		setAdjustOpen(true);
	}

	function handleAdjustKey(key: string): void {
		setAdjustText((previous) => {
			const next = applyCalcInput(
				previous,
				key,
				replaceBalanceOnNextNumericRef.current,
			);
			replaceBalanceOnNextNumericRef.current = next.replaceOnNextNumeric;
			return next.expression;
		});
	}

	function confirmAdjust(): void {
		const result = evalMoneyExpr(adjustText);
		if (result === null) return;
		applyAdjustValue(result);
	}

	function applyAdjustValue(actualCents: number): void {
		setAdjustText(formatCents(actualCents, { grouping: false }));
		if (!existing) {
			setBalanceText(formatCents(actualCents, { grouping: false }));
			setAdjustOpen(false);
			return;
		}
		const plan = planAdjustment(existing.balance, actualCents);
		if (plan.scope === null) {
			setAdjustOpen(false);
			return;
		}
		const direction =
			plan.scope === "income"
				? zh.accounts.adjustDeltaIn
				: zh.accounts.adjustDeltaOut;
		const signedDelta = `${plan.delta > 0 ? "+" : ""}${formatCentsWithSymbol(
			plan.delta,
			existing.currency,
		)}`;
		showDialog(
			zh.accounts.adjustBalance,
			`${formatCentsWithSymbol(existing.balance, existing.currency)} → ${formatCentsWithSymbol(
				actualCents,
				existing.currency,
			)}\n${direction} ${signedDelta}\n\n${zh.accounts.adjustBalancePrompt}`,
			[
				{
					text: zh.common.cancel,
					style: "cancel",
					onPress: () => setAdjustOpen(false),
				},
				{
					text: zh.accounts.adjustNoTxBtn,
					onPress: () => applyAdjust(actualCents, false),
				},
				{
					text: zh.accounts.recordAdjustTx,
					onPress: () => applyAdjust(actualCents, true),
				},
			],
		);
	}

	function applyAdjust(actualCents: number, recordTx: boolean): void {
		if (!existing) return;
		adjust.mutate(
			{ account: existing, actualCents, recordTx },
			{
				onSuccess: () => setAdjustOpen(false),
				onError: (error) =>
					showDialog(
						zh.common.error,
						error instanceof Error ? error.message : String(error),
					),
			},
		);
	}

	async function save(): Promise<boolean> {
		if (submissionLock.current || pending || adjustOpen) return false;
		if (!name.trim()) {
			showDialog(zh.accounts.nameRequired);
			return false;
		}
		const initialBalance = parseMoneyToCents(balanceText || "0");
		if (initialBalance === null) {
			showDialog(zh.accounts.invalidBalance);
			return false;
		}
		const input: AccountInput = {
			name: name.trim(),
			type,
			icon,
			color,
			initialBalance,
			includeInTotal,
		};
		submissionLock.current = true;
		Keyboard.dismiss();
		try {
			if (existing && details) {
				await updateDetails.mutateAsync({ id: existing.id, input: details });
			} else {
				await create.mutateAsync(input);
			}
			bypassDismissGateRef.current = true;
			return true;
		} catch (error) {
			showDialog(zh.common.error, error instanceof Error ? error.message : formLabels.saveFailed);
			return false;
		} finally {
			submissionLock.current = false;
		}
	}

	async function handleSave() {
		if (await save()) onComplete();
	}

	if (editorStage === 0) {
		return (
			<View
				testID="account-editor-summary"
				pointerEvents="none"
				accessibilityLabel={`${name}, ${formatCentsWithSymbol(headerBalance, currency)}`}
				style={[styles.summaryRoot, { backgroundColor: colors.background }]}
			>
				<View
					style={[styles.summaryBalanceCard, { backgroundColor: colors.card }]}
				>
					<Text style={[styles.balanceLabel, { color: colors.textSecondary }]}>
						{zh.accounts.currentAssets}
					</Text>
					<View style={styles.balanceRow}>
						<Text style={[styles.balanceSymbol, { color }]}>
							{currencySymbol(currency)}
						</Text>
						<Text style={[styles.balanceAmount, { color }]}>
							{formatCents(headerBalance)}
						</Text>
					</View>
				</View>

				<View
					style={[styles.summaryIdentityCard, { backgroundColor: colors.card }]}
				>
					<View style={[styles.summaryIcon, { backgroundColor: `${color}22` }]}>
						<Icon name={icon} size={24} color={color} />
					</View>
					<View style={styles.summaryIdentityText}>
						<Text
							numberOfLines={1}
							style={[styles.summaryName, { color: colors.text }]}
						>
							{name || zh.common.loading}
						</Text>
						<Text style={[styles.summaryType, { color: colors.textSecondary }]}>
							{zh.accounts.types[type]}
						</Text>
					</View>
				</View>
			</View>
		);
	}

	return (
		<View style={{ flex: 1, backgroundColor: colors.background }}>
			<ScrollView
				ref={scrollRef}
				removeClippedSubviews={Platform.OS === "android"}
				style={{ flex: 1 }}
				contentContainerStyle={{ padding: 16, paddingBottom: 16 + keyboardHeight }}
				keyboardShouldPersistTaps="handled"
			>
				<Pressable
					style={[styles.balanceCard, { backgroundColor: colors.card }]}
					onPress={() => void openBalanceKeypad()}
				>
					<Text style={[styles.balanceLabel, { color: colors.textSecondary }]}>
						{zh.accounts.currentAssets}
					</Text>
					<View style={styles.balanceRow}>
						<Text style={[styles.balanceSymbol, { color: colors.primary }]}>
							{currencySymbol(currency)}
						</Text>
						<Text style={[styles.balanceAmount, { color: colors.primary }]}>
							{formatCents(headerBalance)}
						</Text>
						<Icon name="chevron-right" size={18} color={colors.textSecondary} />
					</View>
				</Pressable>

				<View style={[styles.card, { backgroundColor: colors.card }]}>
					<Text style={[styles.label, { color: colors.textSecondary }]}>
						{zh.accounts.name}
					</Text>
					<SingleLineTextInput
						accessibilityLabel={zh.accounts.name}
						style={[
							styles.input,
							{ color: colors.text, borderColor: colors.border },
						]}
						value={name}
						onChangeText={setName}
						placeholder={zh.accounts.namePlaceholder}
						placeholderTextColor={colors.textSecondary}
					/>

					{editorStage >= 2 && (
						<>
							<Text style={[styles.label, { color: colors.textSecondary }]}>
								{zh.accounts.type}
							</Text>
							<View style={styles.chipRow}>
								{ACCOUNT_TYPES.slice(0, mountedAccountTypeCount).map(
									(accountType) => (
										<Pressable
											key={accountType}
											style={[
												styles.chip,
												{ borderColor: colors.border },
												type === accountType && {
													backgroundColor: colors.primary,
													borderColor: colors.primary,
												},
											]}
											onPress={() => setType(accountType)}
										>
											<Text
												style={{
													color:
														type === accountType
															? colors.onPrimary
															: colors.text,
													fontSize: 13,
												}}
											>
												{zh.accounts.types[accountType]}
											</Text>
										</Pressable>
									),
								)}
							</View>
						</>
					)}

					{editorStage >= 5 && (
						<>
							<Text style={[styles.label, { color: colors.textSecondary }]}>
								{zh.accounts.icon}
							</Text>
							<View style={styles.chipRow}>
								{ACCOUNT_ICON_KEYS.slice(0, mountedIconCount).map((iconKey) => (
									<Pressable
										key={iconKey}
										accessibilityRole="radio"
										accessibilityLabel={iconKey}
										accessibilityState={{ checked: icon === iconKey }}
										style={[
											styles.iconChip,
											{
												borderColor:
													icon === iconKey ? colors.primary : colors.border,
											},
										]}
										onPress={() => setIcon(iconKey)}
									>
										<Icon
											name={iconKey}
											size={20}
											color={icon === iconKey ? colors.primary : colors.text}
										/>
									</Pressable>
								))}
							</View>
						</>
					)}

					{editorStage >= 9 && (
						<>
							<Text style={[styles.label, { color: colors.textSecondary }]}>
								{zh.accounts.color}
							</Text>
							<View style={styles.chipRow}>
								{COLOR_OPTIONS.map((option) => (
									<Pressable
										key={option}
										accessibilityRole="radio"
										accessibilityLabel={`${zh.accounts.color} ${option}`}
										accessibilityState={{ checked: color === option }}
										hitSlop={4}
										style={[
											styles.colorDot,
											{ backgroundColor: option },
											color === option && {
												borderWidth: 3,
												borderColor: colors.text,
											},
										]}
										onPress={() => setColor(option)}
									/>
								))}
							</View>

							{editorStage >= 10 && (
								<View style={styles.switchRow}>
									<Text style={{ color: colors.text, fontSize: 15 }}>
										{zh.accounts.includeInTotal}
									</Text>
									<Switch
										value={includeInTotal}
										onValueChange={setIncludeInTotal}
										trackColor={{ true: colors.primary }}
									/>
								</View>
							)}
						</>
					)}
				</View>

			</ScrollView>
			{editorStage >= 10 && (
				<FormActionBar
					testID="account-save"
					label={existing ? formLabels.saveChanges : zh.common.save}
					hint={!name.trim() ? zh.accounts.nameRequired : undefined}
					onPress={handleSave}
					pending={pending}
					disabled={!name.trim()}
				/>
			)}

			{adjustOpen && (
				<Animated.View
					entering={FadeIn.duration(motion.fast).reduceMotion(
						ReduceMotion.System,
					)}
					exiting={FadeOut.duration(motion.fast).reduceMotion(
						ReduceMotion.System,
					)}
					style={[
						StyleSheet.absoluteFill,
						{ backgroundColor: "rgba(0,0,0,0.4)" },
					]}
					onStartShouldSetResponder={() => {
						setAdjustOpen(false);
						return true;
					}}
				/>
			)}
			{adjustOpen && (
				<Animated.View
					entering={SlideInUp.duration(motion.sheetEnter)
						.easing(Easing.bezier(...motion.sheetCurve))
						.reduceMotion(ReduceMotion.System)}
					exiting={SlideOutDown.duration(motion.sheetExit)
						.easing(Easing.bezier(...motion.sheetCurve))
						.reduceMotion(ReduceMotion.System)}
					style={{ position: "absolute", left: 0, right: 0, bottom: 0 }}
				>
					<AmountKeypadPanel
						amountText={adjustText}
						currency={currency}
						accentColor={colors.primary}
						onKey={handleAdjustKey}
						onDone={confirmAdjust}
						okDisabled={evalMoneyExpr(adjustText) === null}
					/>
				</Animated.View>
			)}
		</View>
	);
}

export const AccountEditor = forwardRef<
	AccountEditorHandle,
	AccountEditorProps
>(AccountEditorComponent);

const styles = StyleSheet.create({
	summaryRoot: { flex: 1, padding: 16, gap: 12 },
	summaryBalanceCard: { borderRadius: 14, padding: 16 },
	summaryIdentityCard: {
		borderRadius: 12,
		padding: 14,
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
	},
	summaryIcon: {
		width: 44,
		height: 44,
		borderRadius: 12,
		alignItems: "center",
		justifyContent: "center",
	},
	summaryIdentityText: { flex: 1, minWidth: 0 },
	summaryName: { fontSize: 17, fontWeight: "600" },
	summaryType: { fontSize: 13, marginTop: 3 },
	balanceCard: { borderRadius: 12, padding: 16, marginBottom: 16 },
	balanceLabel: { fontSize: 13, marginBottom: 8 },
	balanceRow: { flexDirection: "row", alignItems: "baseline", gap: 6 },
	balanceSymbol: { fontSize: 22, fontWeight: "600" },
	balanceAmount: { flex: 1, fontSize: 34, fontWeight: "700" },
	card: { borderRadius: 12, padding: 16, marginBottom: 16 },
	label: { fontSize: 13, marginBottom: 8, marginTop: 14 },
	input: {
		minHeight: 48,
		borderWidth: 1,
		borderRadius: 8,
		paddingHorizontal: 12,
		fontSize: 15,
	},
	chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
	chip: {
		minHeight: 48,
		justifyContent: "center",
		paddingHorizontal: 12,
		paddingVertical: 7,
		borderRadius: 16,
		borderWidth: 1,
	},
	iconChip: {
		width: 48,
		height: 48,
		borderRadius: 10,
		borderWidth: 1,
		alignItems: "center",
		justifyContent: "center",
	},
	colorDot: { width: 40, height: 40, borderRadius: 20 },
	switchRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		marginTop: 18,
	},
});

export default AccountEditor;
