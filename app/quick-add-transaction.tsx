import { useCallback, useEffect, useRef } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { BackHandler, Platform, ToastAndroid, View } from "react-native";
import {
	AddTransactionFlow,
	parseAddTransactionLaunch,
	type AddTransactionRouteParams,
} from "@/features/transactions";
import type { TransactionFormHandle } from "@/features/transactions/components/TransactionForm";
import { isQuickAddPresentationReady } from "@/features/transactions/quickAddPerformance";
import { zh } from "@/i18n/zh";
import {
	completeQuickAddHandoff,
	completeQuickAddInteractive,
	revealQuickAddPresentation,
} from "@/lib/quickKeypad";

export default function QuickAddTransactionScreen() {
	const router = useRouter();
	const params = useLocalSearchParams<AddTransactionRouteParams>();
	const launch = parseAddTransactionLaunch(params);
	const handoffId = params.handoffId;
	const hasNativeHandoff =
		process.env.EXPO_OS === "android" && Boolean(handoffId);
	const flowKey = `${params.amount ?? ""}:${params.currency ?? ""}:${params.type ?? ""}:${handoffId ?? ""}`;
	const formRef = useRef<TransactionFormHandle>(null);
	const completedHandoffId = useRef<string | null>(null);
	const pendingFrame = useRef<number | null>(null);
	// Use the root Activity's default back behavior after the sheet has fully exited. Android
	// can then hand the window back to the launcher without mounting another app route first.
	const exitQuickAdd = useCallback(() => {
		if (process.env.EXPO_OS === "android") {
			// Below S, invokeDefaultOnBackPressed moves the task to back instead of finishing:
			// the route stack (and this form) would survive and reappear on the next launch.
			// (iOS/web Version is a string, but this branch is Android-only.)
			if (Number(Platform.Version) < 31) router.dismissAll();
			BackHandler.exitApp();
			return;
		}
		router.replace("/");
	}, [router]);
	// Close a nested overlay before dismissing the sheet itself.
	const handleBeforeDismiss = useCallback(
		() => !formRef.current?.closeOverlaysIfAny(),
		[],
	);
	// Queue the system-owned toast before removing the task.
	const handleCreated = useCallback(() => {
		if (process.env.EXPO_OS === "android") {
			ToastAndroid.show(zh.tx.addSuccess, ToastAndroid.SHORT);
		}
		exitQuickAdd();
	}, [exitQuickAdd]);
	const completedInteractiveHandoffId = useRef<string | null>(null);
	const formInteractiveHandoffId = useRef<string | null>(null);
	const sheetEnteredHandoffId = useRef<string | null>(null);
	const completeHandoffAfterLayout = useCallback(() => {
		if (!handoffId || completedHandoffId.current === handoffId) return;
		if (pendingFrame.current !== null)
			cancelAnimationFrame(pendingFrame.current);
		pendingFrame.current = requestAnimationFrame(() => {
			pendingFrame.current = null;
			completedHandoffId.current = handoffId;
			completeQuickAddHandoff(handoffId);
		});
	}, [handoffId]);
	const completeHandoffWhenReady = useCallback(() => {
		if (!handoffId || completedInteractiveHandoffId.current === handoffId)
			return;
		if (!isQuickAddPresentationReady({
			handoffId,
			formInteractiveHandoffId: formInteractiveHandoffId.current,
			sheetEnteredHandoffId: sheetEnteredHandoffId.current,
		})) {
			return;
		}
		completedInteractiveHandoffId.current = handoffId;
		completeQuickAddInteractive(handoffId);
	}, [handoffId]);
	const handleFormInteractive = useCallback(() => {
		if (!handoffId) return;
		formInteractiveHandoffId.current = handoffId;
		completeHandoffWhenReady();
	}, [completeHandoffWhenReady, handoffId]);
	const handleSheetEntered = useCallback(() => {
		if (!handoffId) return;
		sheetEnteredHandoffId.current = handoffId;
		completeHandoffWhenReady();
	}, [completeHandoffWhenReady, handoffId]);
	const handleBeforeEntry = useCallback(async () => {
		if (!handoffId) return;
		await revealQuickAddPresentation(handoffId);
	}, [handoffId]);

	useEffect(
		() => () => {
			if (pendingFrame.current !== null)
				cancelAnimationFrame(pendingFrame.current);
		},
		[],
	);

	// SecondarySheetScreen owns hardware back handling. The native cover is removed immediately
	// before entry while the keypad stays retained until the form and sheet are both ready.
	return (
		<View
			key={flowKey}
			style={{ flex: 1 }}
			onLayout={completeHandoffAfterLayout}
		>
			<AddTransactionFlow
				{...launch}
				clientTag={handoffId}
				ref={formRef}
				// The native keypad already supplied the amount. Stage the remaining editor sections to
				// keep the first committed form frame small.
				renderMode="staged-editor"
				stageFramesPerStep={1}
				onBeforeDismiss={handleBeforeDismiss}
				onClose={exitQuickAdd}
				onCreated={handleCreated}
				onInteractive={handleFormInteractive}
				onEntered={handleSheetEntered}
				beforeEntry={hasNativeHandoff ? handleBeforeEntry : undefined}
				initialScrimOpacity={hasNativeHandoff ? 0.38 : 0}
				skipExitAnimation
			/>
		</View>
	);
}
