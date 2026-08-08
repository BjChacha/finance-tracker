import React, {
	createContext,
	type ReactNode,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { useRouter } from "expo-router";
import { Alert, StyleSheet, Text, View } from "react-native";
import {
	SecondarySheetSurface,
	SheetHeaderIconButton,
	type SheetDismiss,
} from "@/components/navigation/secondary-sheet-screen";
import {
	AccountEditor,
	type AccountEditorHandle,
} from "@/features/accounts/components/AccountEditor";
import {
	useAccountBalances,
	useDeleteAccount,
} from "@/features/accounts/hooks";
import {
	TransactionForm,
	type TransactionFormHandle,
	useRemoveTransaction,
	useTransaction,
	useUpdateTransaction,
} from "@/features/transactions";
import { zh } from "@/i18n/zh";
import { useTheme } from "@/theme";

type ResidentEditorKind = "transaction" | "account";

type ResidentEditorTarget = {
	kind: ResidentEditorKind;
	id: string;
	token: number;
	routeBackOnDismiss: boolean;
};

type ResidentEditorCoordinator = {
	present: (
		kind: ResidentEditorKind,
		id: string,
		routeBackOnDismiss?: boolean,
	) => number;
	release: (token: number) => void;
	dismissImmediately: () => void;
};

const ResidentEditorContext = createContext<ResidentEditorCoordinator | null>(
	null,
);

function useResidentEditorCoordinator(): ResidentEditorCoordinator {
	const value = React.use(ResidentEditorContext);
	if (!value)
		throw new Error(
			"Resident editor routes must be inside ResidentEditorSheetProvider",
		);
	return value;
}

export function useResidentEditorRoute(
	kind: ResidentEditorKind,
	id: string | undefined,
): void {
	const { present, release } = useResidentEditorCoordinator();

	useEffect(() => {
		if (!id) return;
		const token = present(kind, id, true);
		return () => release(token);
	}, [id, kind, present, release]);
}

export function useResidentEditor() {
	const { present } = useResidentEditorCoordinator();

	return useMemo(
		() => ({
			openTransaction: (id: string) => present("transaction", id),
			openAccount: (id: string) => present("account", id),
		}),
		[present],
	);
}

/**
 * 立即收起常驻编辑器（无退场动画、不回退路由）。
 *
 * 常驻 Host 挂在 Stack 之外，靠自身 state 显示，`router.dismissAll()` 清不掉它；
 * 快捷记账换栈前需要这个来保证记账界面不被详情卡片盖住。
 */
export function useResidentEditorDismiss(): () => void {
	return useResidentEditorCoordinator().dismissImmediately;
}

type ProviderProps = {
	children: ReactNode;
};

export function ResidentEditorSheetProvider({ children }: ProviderProps) {
	const nextTokenRef = useRef(0);
	const [target, setTarget] = useState<ResidentEditorTarget | null>(null);

	const present = useCallback(
		(kind: ResidentEditorKind, id: string, routeBackOnDismiss = false) => {
			const token = ++nextTokenRef.current;
			setTarget({ kind, id, token, routeBackOnDismiss });
			return token;
		},
		[],
	);

	const release = useCallback((token: number) => {
		setTarget((current) => (current?.token === token ? null : current));
	}, []);

	// 强制收起：直接清空 target，不走退场动画、不触发 finishDismiss 的 router.back()。
	const dismissImmediately = useCallback(() => setTarget(null), []);

	const coordinator = useMemo(
		() => ({ present, release, dismissImmediately }),
		[dismissImmediately, present, release],
	);
	const handleTargetDismissed = useCallback((token: number) => {
		setTarget((current) => (current?.token === token ? null : current));
	}, []);

	return (
		<ResidentEditorContext.Provider value={coordinator}>
			{children}
			<ResidentEditorSheetHost
				target={target}
				onTargetDismissed={handleTargetDismissed}
			/>
		</ResidentEditorContext.Provider>
	);
}

type HostProps = {
	target: ResidentEditorTarget | null;
	onTargetDismissed: (token: number) => void;
};

function ResidentEditorSheetHost({ target, onTargetDismissed }: HostProps) {
	const router = useRouter();
	const { colors } = useTheme();
	const transactionRef = useRef<TransactionFormHandle>(null);
	const accountRef = useRef<AccountEditorHandle>(null);
	const openingFrameRef = useRef<number | null>(null);
	const pendingDismissRef = useRef<ResidentEditorTarget | null>(null);
	const closingRef = useRef(false);
	const [surfaceVisible, setSurfaceVisible] = useState(false);
	const [surfacePreparing, setSurfacePreparing] = useState(false);
	const [interactive, setInteractive] = useState(false);
	const [prewarmStarted, setPrewarmStarted] = useState(false);
	const [transactionWarmed, setTransactionWarmed] = useState(false);
	const [accountWarmed, setAccountWarmed] = useState(false);
	const [hydratedSessionKey, setHydratedSessionKey] = useState<string | null>(
		null,
	);

	const transactionId = target?.kind === "transaction" ? target.id : "";
	const accountId = target?.kind === "account" ? target.id : undefined;
	const sessionKey = target
		? `${target.kind}:${target.token}:${target.id}`
		: null;
	const transactionQuery = useTransaction(transactionId);
	const accountsQuery = useAccountBalances();
	const transaction = transactionQuery.data ?? null;
	const account = accountId
		? ((accountsQuery.data ?? []).find(
				(candidate) => candidate.id === accountId,
			) ?? null)
		: null;
	const updateTransaction = useUpdateTransaction();
	const removeTransaction = useRemoveTransaction();
	const removeAccount = useDeleteAccount();

	const mountTransaction = prewarmStarted || target?.kind === "transaction";
	const mountAccount =
		target?.kind === "account" || (prewarmStarted && transactionWarmed);
	const transactionRenderMode =
		transactionWarmed || target?.kind === "transaction"
			? "editor"
			: "staged-editor";
	const accountRenderMode =
		accountWarmed || target?.kind === "account" ? "editor" : "staged-editor";

	useEffect(() => {
		let cancelled = false;
		let firstFrame: number | null = null;
		let secondFrame: number | null = null;
		let timer: ReturnType<typeof setTimeout> | null = null;
		firstFrame = requestAnimationFrame(() => {
			secondFrame = requestAnimationFrame(() => {
				timer = setTimeout(() => {
					if (!cancelled) setPrewarmStarted(true);
				}, 180);
			});
		});
		return () => {
			cancelled = true;
			if (firstFrame !== null) cancelAnimationFrame(firstFrame);
			if (secondFrame !== null) cancelAnimationFrame(secondFrame);
			if (timer !== null) clearTimeout(timer);
		};
	}, []);

	useEffect(
		() => () => {
			if (openingFrameRef.current !== null)
				cancelAnimationFrame(openingFrameRef.current);
		},
		[],
	);

	useEffect(() => {
		if (openingFrameRef.current !== null) {
			cancelAnimationFrame(openingFrameRef.current);
			openingFrameRef.current = null;
		}
		// 强制收起（dismissImmediately）时 target 直接变 null，退场回调不会跑；
		// 这里一并复位 closingRef/pendingDismissRef，否则下次 present 会被旧标记卡住。
		closingRef.current = false;
		pendingDismissRef.current = null;
		if (!target) {
			setInteractive(false);
			setSurfacePreparing(false);
			if (surfaceVisible) setSurfaceVisible(false);
			return;
		}
		setInteractive(false);
		setSurfacePreparing(false);
		setSurfaceVisible(false);
	}, [target?.token]);

	const targetError =
		target?.kind === "transaction"
			? transactionQuery.isFetched && !transaction
			: target?.kind === "account"
				? accountsQuery.isFetched && !account
				: false;
	const targetWarmed =
		target?.kind === "transaction"
			? transactionWarmed
			: target?.kind === "account"
				? accountWarmed
				: false;
	const targetHydrated =
		sessionKey !== null && hydratedSessionKey === sessionKey;

	useEffect(() => {
		if (!target || surfaceVisible || closingRef.current) return;
		if (!targetError && (!targetWarmed || !targetHydrated)) return;
		if (surfacePreparing || openingFrameRef.current !== null) return;
		setInteractive(true);
		setSurfacePreparing(true);
		openingFrameRef.current = requestAnimationFrame(() => {
			openingFrameRef.current = requestAnimationFrame(() => {
				openingFrameRef.current = null;
				if (closingRef.current) return;
				setSurfacePreparing(false);
				setSurfaceVisible(true);
			});
		});
	}, [
		surfacePreparing,
		surfaceVisible,
		target,
		targetError,
		targetHydrated,
		targetWarmed,
	]);

	const finishDismiss = useCallback(() => {
		const dismissedTarget = pendingDismissRef.current;
		if (!dismissedTarget) return;
		pendingDismissRef.current = null;
		onTargetDismissed(dismissedTarget.token);
		if (dismissedTarget.routeBackOnDismiss) router.back();
	}, [onTargetDismissed, router]);

	const startDismiss = useCallback<SheetDismiss>(() => {
		if (!target || closingRef.current) return;
		closingRef.current = true;
		setInteractive(false);
		setSurfacePreparing(false);
		pendingDismissRef.current = target;
		setSurfaceVisible(false);
	}, [target]);

	const requestDismiss = useCallback(() => {
		if (!target || closingRef.current) return;
		void (async () => {
			if (target.kind === "account" && accountRef.current?.handleBackPress())
				return;
			const canDismiss =
				target.kind === "transaction"
					? await transactionRef.current?.prepareDismiss()
					: await accountRef.current?.prepareDismiss();
			if (canDismiss ?? true) startDismiss();
		})();
	}, [startDismiss, target]);

	const confirmTransactionDelete = useCallback(() => {
		if (!transaction || target?.kind !== "transaction") return;
		const deleteToken = target.token;
		Alert.alert(zh.common.delete, zh.tx.deleteConfirm, [
			{ text: zh.common.cancel, style: "cancel" },
			{
				text: zh.common.delete,
				style: "destructive",
				onPress: async () => {
					try {
						await removeTransaction.mutateAsync(transaction.id);
						if (target.token === deleteToken) startDismiss();
					} catch (error) {
						Alert.alert(
							zh.common.error,
							error instanceof Error ? error.message : String(error),
						);
					}
				},
			},
		]);
	}, [removeTransaction, startDismiss, target, transaction]);

	const confirmAccountDelete = useCallback(() => {
		if (!account || target?.kind !== "account") return;
		const deleteToken = target.token;
		Alert.alert(
			zh.accounts.deleteTitle(account.name),
			zh.accounts.deleteConfirm,
			[
				{ text: zh.common.cancel, style: "cancel" },
				{
					text: zh.accounts.deletePermanently,
					style: "destructive",
					onPress: async () => {
						try {
							await removeAccount.mutateAsync(account.id);
							if (target.token === deleteToken) startDismiss();
						} catch (error) {
							Alert.alert(
								zh.common.error,
								error instanceof Error ? error.message : String(error),
							);
						}
					},
				},
			],
		);
	}, [account, removeAccount, startDismiss, target]);

	const handleSaveTransaction = useCallback(() => {
		void (async () => {
			const ok = await transactionRef.current?.save();
			if (ok) startDismiss();
		})();
	}, [startDismiss]);

	const handleSaveAccount = useCallback(() => {
		void (async () => {
			const ok = await accountRef.current?.save();
			if (ok) startDismiss();
		})();
	}, [startDismiss]);

	const handleTransactionHydrated = useCallback((key: string | number) => {
		setHydratedSessionKey(String(key));
	}, []);
	const handleAccountHydrated = useCallback((key: string | number) => {
		setHydratedSessionKey(String(key));
	}, []);

	const transactionInitialValues = transaction
		? {
				type: transaction.type,
				amount: transaction.amount,
				fee: transaction.fee,
				accountId: transaction.accountId,
				toAccountId: transaction.toAccountId,
				categoryId: transaction.categoryId,
				projectId: transaction.projectId,
				dateMs: transaction.date,
				note: transaction.note,
				currency: transaction.currency,
				exchangeRate: transaction.exchangeRate,
			}
		: undefined;
	const activeKind = targetError ? null : (target?.kind ?? null);
	const title = target?.kind === "account" ? zh.accounts.edit : zh.common.edit;
	const canDeleteTransaction = target?.kind === "transaction" && !!transaction;
	const canDeleteAccount = target?.kind === "account" && !!account;
	const headerRight = (
		<View style={styles.headerActions}>
			{(canDeleteTransaction || canDeleteAccount) && (
				<SheetHeaderIconButton
					icon="trash-2"
					label={zh.common.delete}
					color={colors.expense}
					onPress={
						canDeleteTransaction
							? confirmTransactionDelete
							: confirmAccountDelete
					}
				/>
			)}
			<SheetHeaderIconButton
				icon="check"
				label={zh.common.save}
				onPress={
					target?.kind === "account" ? handleSaveAccount : handleSaveTransaction
				}
			/>
		</View>
	);

	return (
		<SecondarySheetSurface
			visible={surfaceVisible}
			preparing={surfacePreparing}
			interactive={interactive}
			title={title}
			headerRight={headerRight}
			onRequestDismiss={requestDismiss}
			onExited={finishDismiss}
		>
			<View style={styles.editorStack}>
				{mountTransaction && (
					<View
						testID="resident-transaction-editor"
						pointerEvents={
							activeKind === "transaction" && interactive ? "auto" : "none"
						}
						accessibilityElementsHidden={activeKind !== "transaction"}
						importantForAccessibility={
							activeKind === "transaction" ? "auto" : "no-hide-descendants"
						}
						style={[
							styles.editorLayer,
							activeKind !== "transaction" && styles.hiddenLayer,
						]}
					>
						<TransactionForm
							ref={transactionRef}
							mode="edit"
							renderMode={transactionRenderMode}
							sessionKey={transaction ? sessionKey : null}
							initialValues={transactionInitialValues}
							submitting={updateTransaction.isPending}
							onSessionHydrated={handleTransactionHydrated}
							onEditorReady={() => setTransactionWarmed(true)}
							onSubmit={(input) => {
								if (!transaction) return;
								return updateTransaction
									.mutateAsync({ id: transaction.id, input })
									.then(() => undefined);
							}}
						/>
					</View>
				)}

				{mountAccount && (
					<View
						testID="resident-account-editor"
						pointerEvents={
							activeKind === "account" && interactive ? "auto" : "none"
						}
						accessibilityElementsHidden={activeKind !== "account"}
						importantForAccessibility={
							activeKind === "account" ? "auto" : "no-hide-descendants"
						}
						style={[
							styles.editorLayer,
							activeKind !== "account" && styles.hiddenLayer,
						]}
					>
						<AccountEditor
							ref={accountRef}
							accountId={accountId}
							renderMode={accountRenderMode}
							sessionKey={account ? sessionKey : null}
							onSessionHydrated={handleAccountHydrated}
							onEditorReady={() => setAccountWarmed(true)}
							onComplete={startDismiss}
						/>
					</View>
				)}

				{targetError && (
					<View style={styles.errorState}>
						<Text style={{ color: colors.textSecondary }}>
							{zh.common.empty}
						</Text>
					</View>
				)}
			</View>
		</SecondarySheetSurface>
	);
}

const styles = StyleSheet.create({
	editorStack: { flex: 1 },
	editorLayer: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 },
	hiddenLayer: { opacity: 0 },
	errorState: { flex: 1, alignItems: "center", justifyContent: "center" },
	headerActions: { flexDirection: "row", alignItems: "center" },
});
