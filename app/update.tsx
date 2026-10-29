import { useEffect, useState } from "react";
import {
	ActivityIndicator,
	AppState,
	Platform,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	View,
} from "react-native";
import Animated, {
	Easing,
	cancelAnimation,
	useAnimatedStyle,
	useSharedValue,
	withRepeat,
	withTiming,
} from "react-native-reanimated";
import { Icon } from "@/components/Icon";
import { SecondarySheetScreen } from "@/components/navigation/secondary-sheet-screen";
import {
	deriveUpdateStatus,
	downloadApk,
	findCachedApk,
	getCurrentVersion,
	installApk,
	openInstallPermissionSettings,
	useLatestRelease,
	type ReleaseInfo,
} from "@/features/update";
import { zh } from "@/i18n/zh";
import { dayjs } from "@/lib/date";
import { motion, useTheme } from "@/theme";

/** 下载/安装的页面局部状态机（安装器拉起后应用退后台，返回时可重试安装） */
type DownloadState =
	| { phase: "idle" }
	| { phase: "downloading"; loaded: number; total: number }
	| { phase: "ready"; fileUri: string }
	| { phase: "error" };

/** 顶部信息行：标签 + 值（当前版本 / 最新版本 / 发布时间） */
function InfoRow({ label, value }: { label: string; value: string }) {
	const { colors } = useTheme();
	return (
		<View style={styles.infoRow}>
			<Text style={{ color: colors.textSecondary, fontSize: 14 }}>{label}</Text>
			<Text style={{ color: colors.text, fontSize: 14, fontWeight: "600" }}>
				{value}
			</Text>
		</View>
	);
}

/**
 * 「正在检查」态。
 *
 * 手动检查时 React Query 的 `isPending` 已经是 false，如果只看它就会一直显示上一次
 * 的结果（表面上看不出「点了没反应」）。因此检查中单独占一整块：旋转图标 + 文案，
 * 与检查完的结果态互斥渲染。
 */
function CheckingBlock() {
	const { colors } = useTheme();
	const spin = useSharedValue(0);

	useEffect(() => {
		spin.value = 0;
		spin.value = withRepeat(
			withTiming(360, { duration: motion.base * 5, easing: Easing.linear }),
			-1,
			false,
		);
		return () => cancelAnimation(spin);
	}, [spin]);

	const spinStyle = useAnimatedStyle(() => ({
		transform: [{ rotate: `${spin.value}deg` }],
	}));

	return (
		<View style={styles.statusBlock}>
			<View
				style={[
					styles.spinnerRing,
					{ borderColor: colors.border, backgroundColor: colors.card },
				]}
			>
				<Animated.View style={spinStyle}>
					<Icon name="rotate-ccw" size={24} color={colors.primary} />
				</Animated.View>
			</View>
			<Text style={{ color: colors.text, fontSize: 15, fontWeight: "600" }}>
				{zh.update.checking}
			</Text>
			<Text
				style={{
					color: colors.textSecondary,
					fontSize: 12,
					textAlign: "center",
				}}
			>
				{zh.update.checkingHint}
			</Text>
		</View>
	);
}

/** 检查结果尾注：检查时间 + 重新检查（区分「刚查过」与「正在查」） */
function CheckedAt({ at, onRecheck }: { at: number; onRecheck: () => void }) {
	const { colors } = useTheme();
	return (
		<View style={styles.checkedAtRow}>
			<Text style={{ color: colors.textSecondary, fontSize: 12 }}>
				{zh.update.checkedAt(dayjs(at).format("HH:mm"))}
			</Text>
			<Pressable
				accessibilityRole="button"
				accessibilityLabel={zh.update.recheck}
				hitSlop={8}
				onPress={onRecheck}
			>
				<Text style={{ color: colors.primary, fontSize: 12, fontWeight: "600" }}>
					{zh.update.recheck}
				</Text>
			</Pressable>
		</View>
	);
}

/** 主按钮（与全 App 主操作一致：primary 底 + onPrimary 字） */
function PrimaryButton({
	label,
	onPress,
	disabled,
	loading,
}: {
	label: string;
	onPress: () => void;
	disabled?: boolean;
	loading?: boolean;
}) {
	const { colors } = useTheme();
	return (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel={label}
			style={[
				styles.primaryButton,
				{ backgroundColor: colors.primary },
				(disabled || loading) && { opacity: 0.6 },
			]}
			disabled={disabled || loading}
			onPress={onPress}
		>
			{loading ? (
				<ActivityIndicator size="small" color={colors.onPrimary} />
			) : (
				<Text style={{ color: colors.onPrimary, fontSize: 15, fontWeight: "600" }}>
					{label}
				</Text>
			)}
		</Pressable>
	);
}

export default function UpdateScreen() {
	const { colors } = useTheme();
	const query = useLatestRelease();
	const status = deriveUpdateStatus(query);
	// 检查中包括「手动重新检查」（此时 isPending 为 false，但正在发请求）
	const checking = query.isPending || query.isFetching;
	const [download, setDownload] = useState<DownloadState>({ phase: "idle" });
	const [installBlocked, setInstallBlocked] = useState(false);
	const [installAborted, setInstallAborted] = useState(false);

	// 进入页面即强制检查一次（绕过 6h 缓存，手动入口的语义就是"现在查"）
	useEffect(() => {
		void query.refetch();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const release = status.state === "available" ? status.release : null;
	const releaseVersion = release?.version ?? null;
	const releaseApkSize = release?.apkSize ?? 0;

	// 缓存命中就不再让用户重下几十 MB：安装被系统拦下后返回页面可直接再次安装
	useEffect(() => {
		if (!releaseVersion) return;
		const cached = findCachedApk({ version: releaseVersion, apkSize: releaseApkSize });
		if (cached) setDownload({ phase: "ready", fileUri: cached });
	}, [releaseVersion, releaseApkSize]);

	// 安装会把人带到系统安装器：回到前台且版本没变，说明中途被拦或用户退出
	useEffect(() => {
		const subscription = AppState.addEventListener("change", (next) => {
			if (next !== "active" || !releaseVersion) return;
			setInstallAborted(getCurrentVersion() === releaseVersion);
		});
		return () => subscription.remove();
	}, [releaseVersion]);

	async function onDownload(release: ReleaseInfo) {
		setInstallBlocked(false);
		setDownload({ phase: "downloading", loaded: 0, total: release.apkSize });
		try {
			const fileUri = await downloadApk(release, (loaded, total) =>
				setDownload({ phase: "downloading", loaded, total }),
			);
			setDownload({ phase: "ready", fileUri });
		} catch {
			setDownload({ phase: "error" });
		}
	}

	async function onInstall() {
		if (download.phase !== "ready") return;
		setInstallBlocked(false);
		setInstallAborted(false);
		try {
			await installApk(download.fileUri);
		} catch {
			// Android 8+ 未授予「安装未知应用」时系统直接拦截 Intent
			setInstallBlocked(true);
		}
	}

	function renderChangelog(release: ReleaseInfo) {
		return (
			<View style={[styles.card, { backgroundColor: colors.card }]}>
				<Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
					{zh.update.changelog}
				</Text>
				{release.notes ? (
					<Text style={{ color: colors.text, fontSize: 14, lineHeight: 22 }}>
						{release.notes}
					</Text>
				) : null}
			</View>
		);
	}

	function renderActions(release: ReleaseInfo) {
		if (download.phase === "downloading") {
			const pct =
				download.total > 0
					? Math.min(100, Math.floor((download.loaded / download.total) * 100))
					: null;
			return (
				<View style={styles.actionArea}>
					<View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
						<View
							style={{
								width: pct === null ? "30%" : `${pct}%`,
								height: "100%",
								borderRadius: 999,
								backgroundColor: colors.primary,
							}}
						/>
					</View>
					<Text style={{ color: colors.textSecondary, fontSize: 13 }}>
						{pct === null ? zh.update.downloading : `${zh.update.downloading} ${pct}%`}
					</Text>
				</View>
			);
		}
		if (download.phase === "ready") {
			return (
				<View style={styles.actionArea}>
					<PrimaryButton label={zh.update.install} onPress={() => void onInstall()} />
					{installAborted ? (
						<Text style={{ color: colors.expense, fontSize: 13, marginTop: 10, lineHeight: 19 }}>
							{zh.update.installNotFinished}
						</Text>
					) : (
						<Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 10 }}>
							{zh.update.cachedApkHint}
						</Text>
					)}
					{installBlocked ? (
						<View style={styles.installBlocked}>
							<Text style={{ color: colors.expense, fontSize: 13, flex: 1, lineHeight: 19 }}>
								{zh.update.installFailedHint}
							</Text>
							<Pressable
								accessibilityRole="button"
								accessibilityLabel={zh.update.goAuthorize}
								onPress={() => void openInstallPermissionSettings()}
								style={[styles.authorizeButton, { borderColor: colors.primary }]}
							>
								<Text style={{ color: colors.primary, fontSize: 13, fontWeight: "600" }}>
									{zh.update.goAuthorize}
								</Text>
							</Pressable>
						</View>
					) : null}
				</View>
			);
		}
		return (
			<View style={styles.actionArea}>
				{download.phase === "error" ? (
					<Text style={{ color: colors.expense, fontSize: 13, marginBottom: 10 }}>
						{zh.update.downloadFailed}
					</Text>
				) : null}
				<PrimaryButton
					label={zh.update.download}
					onPress={() => void onDownload(release)}
				/>
			</View>
		);
	}

	function renderBody() {
		if (Platform.OS !== "android") {
			return (
				<View style={[styles.card, { backgroundColor: colors.card }]}>
					<Text style={{ color: colors.textSecondary, fontSize: 14 }}>
						{zh.update.notAndroid}
					</Text>
				</View>
			);
		}
		// 检查中优先于任何结果：手动重查时状态仍停在旧结果，不拦一下就看不出在查
		if (checking) return <CheckingBlock />;
		switch (status.state) {
			case "checking":
				return <CheckingBlock />;
			case "error":
				return (
					<View style={styles.statusBlock}>
						<Icon name="circle-question-mark" size={40} color={colors.textSecondary} />
						<Text style={{ color: colors.textSecondary, fontSize: 14 }}>
							{zh.update.checkFailed}
						</Text>
						{query.error instanceof Error ? (
							<Text
								style={{ color: colors.textSecondary, fontSize: 11, textAlign: "center" }}
							>
								{query.error.message}
							</Text>
						) : null}
						<PrimaryButton
							label={zh.update.checkNow}
							onPress={() => void query.refetch()}
						/>
					</View>
				);
			case "upToDate":
				return (
					<View style={styles.statusBlock}>
						<Icon name="circle-check-big" size={40} color={colors.primary} />
						<Text style={{ color: colors.text, fontSize: 15, fontWeight: "600" }}>
							{zh.update.upToDate}
						</Text>
						<InfoRow label={zh.update.currentVersion} value={`v${status.current}`} />
						{query.dataUpdatedAt > 0 ? (
							<CheckedAt
								at={query.dataUpdatedAt}
								onRecheck={() => void query.refetch()}
							/>
						) : null}
					</View>
				);
			case "available":
				return (
					<View>
						<View style={[styles.card, { backgroundColor: colors.card }]}>
							<InfoRow
								label={zh.update.currentVersion}
								value={`v${status.current}`}
							/>
							<View
								style={[
									styles.infoDivider,
									{ backgroundColor: colors.border },
								]}
							/>
							<InfoRow label={zh.update.latestVersion} value={`v${status.release.version}`} />
							<View
								style={[styles.infoDivider, { backgroundColor: colors.border }]}
							/>
							<InfoRow
								label={zh.update.releasedAt}
								value={
									status.release.publishedAt
										? dayjs(status.release.publishedAt).format("YYYY-MM-DD HH:mm")
										: "—"
								}
							/>
						</View>
					{renderChangelog(status.release)}
						{renderActions(status.release)}
						<View style={[styles.card, styles.guideCard, { backgroundColor: colors.card }]}>
							<Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
								{zh.update.installGuideTitle}
							</Text>
							{zh.update.installGuideSteps.map((step, index) => (
								<Text
									key={index}
									style={{ color: colors.text, fontSize: 13, lineHeight: 20 }}
								>
									{index + 1}. {step}
								</Text>
							))}
						</View>
						{query.dataUpdatedAt > 0 ? (
							<CheckedAt
								at={query.dataUpdatedAt}
								onRecheck={() => void query.refetch()}
							/>
						) : null}
					</View>
				);
		}
	}

	return (
		<SecondarySheetScreen title={zh.update.title}>
			<ScrollView
				style={{ flex: 1, backgroundColor: colors.background }}
				contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
			>
				{renderBody()}
			</ScrollView>
		</SecondarySheetScreen>
	);
}

const styles = StyleSheet.create({
	card: { borderRadius: 12, padding: 16, marginBottom: 12 },
	infoRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		paddingVertical: 6,
	},
	infoDivider: { height: StyleSheet.hairlineWidth, marginVertical: 6 },
	sectionTitle: { fontSize: 13, fontWeight: "600", marginBottom: 8 },
	guideCard: { marginTop: 12, marginBottom: 0 },
	actionArea: { marginTop: 8 },
	primaryButton: {
		alignItems: "center",
		justifyContent: "center",
		borderRadius: 12,
		paddingVertical: 14,
	},
	progressTrack: {
		height: 8,
		borderRadius: 999,
		overflow: "hidden",
		marginBottom: 8,
	},
	installBlocked: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		marginTop: 12,
	},
	authorizeButton: {
		borderWidth: 1,
		borderRadius: 8,
		paddingHorizontal: 12,
		paddingVertical: 8,
	},
	statusBlock: {
		alignItems: "center",
		gap: 12,
		paddingVertical: 48,
	},
	spinnerRing: {
		width: 56,
		height: 56,
		borderRadius: 28,
		borderWidth: 2,
		alignItems: "center",
		justifyContent: "center",
		marginBottom: 2,
	},
	checkedAtRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 16,
		marginTop: 4,
	},
});
