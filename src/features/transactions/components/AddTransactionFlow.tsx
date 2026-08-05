import { forwardRef, useState, type ForwardedRef } from "react";
import { Alert, View } from "react-native";
import Animated, {
	Easing,
	FadeIn,
	ReduceMotion,
} from "react-native-reanimated";
import { SecondarySheetScreen } from "@/components/navigation/secondary-sheet-screen";
import type { TransactionType } from "@/db/schema";
import { zh } from "@/i18n/zh";
import { appendCalcKey, evalMoneyExpr } from "@/lib/calc";
import { formatCents } from "@/lib/money";
import { motion, useTheme } from "@/theme";
import type { AddTransactionLaunch } from "../addTransactionLaunch";
import { useCreateTransaction } from "../hooks";
import { promptSwitchOnNegative } from "../promptSwitchOnNegative";
import { AmountKeypadPanel } from "./AmountKeypadPanel";
import { CurrencyPickerModal } from "./CurrencyPickerModal";
import {
	TransactionForm,
	type TransactionFormHandle,
	type TxFormInitialValues,
} from "./TransactionForm";

type Stage =
	| { kind: "keypad" }
	| { kind: "form"; initial: Partial<TxFormInitialValues>; animate: boolean };

type Props = AddTransactionLaunch & {
	presentation?: "sheet" | "screen";
	onClose: () => void;
	onCreated: () => void;
	onInteractive?: () => void;
	onEntered?: () => void;
	skipEntryAnimation?: boolean;
	skipExitAnimation?: boolean;
	renderMode?: "staged-editor" | "editor";
	stageFramesPerStep?: number;
	/** Return false to close a nested form overlay before dismissing the sheet. */
	onBeforeDismiss?: () => boolean | Promise<boolean>;
};

function AddTransactionFlowComponent(
	{
		initialAmountCents,
		initialCurrency,
		initialType,
		presentation = "sheet",
		onClose,
		onCreated,
		onInteractive,
		onEntered,
		skipEntryAnimation,
		skipExitAnimation,
		renderMode,
		stageFramesPerStep,
		onBeforeDismiss,
	}: Props,
	ref: ForwardedRef<TransactionFormHandle>,
) {
	const { colors } = useTheme();
	const create = useCreateTransaction();
	const [stage, setStage] = useState<Stage>(
		initialAmountCents !== null
			? {
					kind: "form",
					initial: {
						type: initialType,
						amount: initialAmountCents,
						currency: initialCurrency,
					},
					animate: false,
				}
			: { kind: "keypad" },
	);
	const [amountText, setAmountText] = useState("");
	const [currency, setCurrency] = useState(initialCurrency);
	const [currencyPickerOpen, setCurrencyPickerOpen] = useState(false);

	const evaluated = evalMoneyExpr(amountText);

	function handleKey(key: string) {
		if (key === "C") {
			setAmountText("");
			return;
		}
		setAmountText((previous) => appendCalcKey(previous, key));
	}

	function goForm(type: TransactionType, cents: number) {
		setStage({
			kind: "form",
			initial: { type, amount: cents, currency },
			animate: true,
		});
	}

	function confirm() {
		const result = evalMoneyExpr(amountText);
		if (result === null || result === 0) return;
		setAmountText(formatCents(result, { grouping: false }));
		if (result < 0) {
			promptSwitchOnNegative({
				cents: result,
				type: "expense",
				onSwitch: (opposite) => goForm(opposite, Math.abs(result)),
				onAbsAmountText: setAmountText,
			});
			return;
		}
		goForm("expense", result);
	}

	function renderContent(completeCreate: () => void) {
		return (
			<>
				{stage.kind === "keypad" && (
					<AmountKeypadPanel
						amountText={amountText}
						currency={currency}
						accentColor={colors.expense}
						onKey={handleKey}
						onDone={confirm}
						onPressCurrency={() => setCurrencyPickerOpen(true)}
						okDisabled={evaluated === null || evaluated === 0}
					/>
				)}

				{stage.kind === "form" && (
					<Animated.View
						entering={
							stage.animate
								? FadeIn.duration(motion.base)
										.easing(Easing.bezier(...motion.sheetCurve))
										.reduceMotion(ReduceMotion.System)
								: undefined
						}
						style={{ flex: 1, backgroundColor: colors.background }}
					>
						<TransactionForm
							ref={ref}
							mode="create"
							initialValues={stage.initial}
							submitting={create.isPending}
							onInteractive={onInteractive}
							renderMode={renderMode}
							stageFramesPerStep={stageFramesPerStep}
							onSubmit={(input) => {
								create.mutate(input, {
									onSuccess: completeCreate,
									onError: (error) =>
										Alert.alert(
											zh.common.error,
											error instanceof Error ? error.message : String(error),
										),
								});
							}}
						/>
					</Animated.View>
				)}

				<CurrencyPickerModal
					visible={currencyPickerOpen}
					selected={currency}
					accentColor={colors.expense}
					onSelect={setCurrency}
					onClose={() => setCurrencyPickerOpen(false)}
				/>
			</>
		);
	}

	if (presentation === "screen") {
		return (
			<View
				style={{
					flex: 1,
					justifyContent: stage.kind === "keypad" ? "flex-end" : undefined,
					backgroundColor: colors.background,
				}}
			>
				{renderContent(onCreated)}
			</View>
		);
	}

	return (
		<SecondarySheetScreen
			variant={stage.kind === "keypad" ? "compact" : "large"}
			title={stage.kind === "form" ? zh.tx.addTitle : undefined}
			onEntered={onEntered}
			skipEntryAnimation={skipEntryAnimation}
			skipExitAnimation={skipExitAnimation}
			onBeforeDismiss={onBeforeDismiss}
			onDismiss={onClose}
		>
			{({ dismiss }) => renderContent(() => dismiss(onCreated))}
		</SecondarySheetScreen>
	);
}

export const AddTransactionFlow = forwardRef(AddTransactionFlowComponent);
