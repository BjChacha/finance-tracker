import {
	QueryClient,
	QueryClientProvider,
	useQueryClient,
} from "@tanstack/react-query";
import { Stack, type ErrorBoundaryProps } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { AppState, Pressable, StyleSheet, Text, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useAppLaunchGate } from "@/components/navigation/app-launch-gate";
import { ResidentEditorSheetProvider } from "@/components/navigation/resident-editor-sheet-host";
import { migrationError } from "@/db/migrate";
import { migrateMealCategoriesOnce, seedIfEmpty } from "@/db/seed";
import { getRatesSync, isStale, refreshRates } from "@/features/currency";
import { runCatchUpIfNeeded } from "@/features/recurring";
import { useQuickActionsBootstrap } from "@/features/quick-actions/useQuickActions";
import { invalidateTransactionData } from "@/features/transactions";
import { zh } from "@/i18n/zh";
import { ThemeProvider, useTheme } from "@/theme";

/** 全局错误边界：渲染异常时给出中文提示与重试，避免白屏 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
	const theme = useTheme();
	return (
		<View
			style={[
				styles.center,
				{ backgroundColor: theme.colors.background, padding: 24 },
			]}
		>
			<Text
				style={{ color: theme.colors.expense, fontSize: 16, fontWeight: "600" }}
			>
				{zh.common.error}
			</Text>
			<Text
				style={{
					color: theme.colors.textSecondary,
					marginTop: 8,
					textAlign: "center",
				}}
			>
				{error.message}
			</Text>
			<Pressable
				onPress={retry}
				style={{
					marginTop: 16,
					paddingHorizontal: 24,
					paddingVertical: 10,
					borderRadius: 8,
					backgroundColor: theme.colors.primary,
				}}
			>
				<Text style={{ color: theme.colors.onPrimary, fontWeight: "600" }}>
					{zh.common.retry}
				</Text>
			</Pressable>
		</View>
	);
}

const queryClient = new QueryClient({
	defaultOptions: { queries: { staleTime: Infinity, gcTime: 5 * 60 * 1000 } },
});

/** 首次启动播种 + 一次性分类数据迁移：幂等、后台执行，不阻塞渲染（非首次启动为几次轻量查询）。 */
function Seeder() {
	useEffect(() => {
		void seedIfEmpty().catch(() => {
			/* 播种失败不阻塞 UI；下次启动会重试 */
		});
		void migrateMealCategoriesOnce().catch(() => {
			/* 迁移失败不阻塞 UI；下次启动会重试（迁移本身幂等） */
		});
	}, []);
	return null;
}

/** 注册桌面快捷方式并把命中动作路由到对应页面（无 UI）。 */
function QuickActionsGate() {
	useQuickActionsBootstrap();
	return null;
}

/** 周期记账补账：迁移+种子完成后跑一次，AppState 回前台再跑（同一天节流） */
function RecurringCatchUpRunner() {
	const qc = useQueryClient();

	useEffect(() => {
		const run = () => {
			void runCatchUpIfNeeded().then((result) => {
				if (!result) return;
				if (result.created > 0) void invalidateTransactionData(qc);
				void qc.invalidateQueries({ queryKey: ["recurring"] });
			});
		};
		run();
		const sub = AppState.addEventListener("change", (state) => {
			if (state === "active") run();
		});
		return () => sub.remove();
	}, [qc]);

	return null;
}

/** 汇率表后台自动刷新：mount + 回前台时，若缓存陈旧（>24h 或从未拉取）则 fire-and-forget 拉一次，不阻塞渲染。 */
function RatesAutoRefresh() {
	const qc = useQueryClient();

	useEffect(() => {
		const run = () => {
			if (!isStale(getRatesSync())) return;
			void refreshRates()
				.then(() => qc.invalidateQueries({ queryKey: ["rates"] }))
				.catch(() => {
					/* 静默失败，保留旧缓存/默认值，下次回前台再试 */
				});
		};
		run();
		const sub = AppState.addEventListener("change", (state) => {
			if (state === "active") run();
		});
		return () => sub.remove();
	}, [qc]);

	return null;
}

/** 主题门之内的应用主体：迁移已在模块加载时完成，此处仅做失败兜底 + 渲染路由栈 */
function AppShell() {
	const theme = useTheme();
	const onAppLayout = useAppLaunchGate({
		navigationFallbackReady: Boolean(migrationError),
	});
	const sheetOptions = {
		presentation: "transparentModal" as const,
		headerShown: false,
		animation: "none" as const,
		gestureEnabled: false,
		contentStyle: { backgroundColor: "transparent" },
	};

	// 迁移已在模块加载时完成（@/db/migrate，top-level await）；此处仅处理失败兜底。
	if (migrationError) {
		return (
			<View
				onLayout={onAppLayout}
				style={[styles.center, { backgroundColor: theme.colors.background }]}
			>
				<Text style={{ color: theme.colors.expense, fontSize: 16 }}>
					{zh.db.migrateError}
				</Text>
				<Text style={{ color: theme.colors.textSecondary, marginTop: 8 }}>
					{migrationError.message}
				</Text>
			</View>
		);
	}

	return (
		<View style={styles.appRoot} onLayout={onAppLayout}>
			<ResidentEditorSheetProvider>
				<Seeder />
				<RecurringCatchUpRunner />
				<RatesAutoRefresh />
				<QuickActionsGate />
				<StatusBar style={theme.dark ? "light" : "dark"} />
				<Stack
					screenOptions={{
						headerStyle: { backgroundColor: theme.colors.card },
						headerTintColor: theme.colors.text,
						contentStyle: { backgroundColor: theme.colors.background },
					}}
				>
					<Stack.Screen name="(tabs)" options={{ headerShown: false }} />
					<Stack.Screen name="transactions/index" options={sheetOptions} />
					<Stack.Screen name="transactions/search" options={sheetOptions} />
					<Stack.Screen name="add-transaction" options={sheetOptions} />
					<Stack.Screen name="quick-add-transaction" options={sheetOptions} />
					<Stack.Screen name="transaction/[id]" options={sheetOptions} />
					<Stack.Screen name="accounts/index" options={sheetOptions} />
					<Stack.Screen name="accounts/edit" options={sheetOptions} />
					<Stack.Screen name="categories/index" options={sheetOptions} />
					<Stack.Screen name="projects/index" options={sheetOptions} />
					<Stack.Screen name="budgets" options={sheetOptions} />
					<Stack.Screen name="appearance" options={sheetOptions} />
					<Stack.Screen name="rates" options={sheetOptions} />
					<Stack.Screen name="backup/index" options={sheetOptions} />
					<Stack.Screen name="import/index" options={{ title: zh.imp.title }} />
					<Stack.Screen name="recurring/index" options={sheetOptions} />
					<Stack.Screen name="recurring/edit" options={sheetOptions} />
				</Stack>
			</ResidentEditorSheetProvider>
		</View>
	);
}

export default function RootLayout() {
	return (
		<GestureHandlerRootView style={{ flex: 1 }}>
			<QueryClientProvider client={queryClient}>
				<ThemeProvider>
					<AppShell />
				</ThemeProvider>
			</QueryClientProvider>
		</GestureHandlerRootView>
	);
}

const styles = StyleSheet.create({
	appRoot: { flex: 1 },
	center: { flex: 1, alignItems: "center", justifyContent: "center" },
});
