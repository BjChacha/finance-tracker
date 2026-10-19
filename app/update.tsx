import { useEffect, useState } from "react";
import {
	ActivityIndicator,
	Platform,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { Icon } from "@/components/Icon";
import { SecondarySheetScreen } from "@/components/navigation/secondary-sheet-screen";
import {
	deriveUpdateStatus,
	downloadApk,
	installApk,
	openInstallPermissionSettings,
	useLatestRelease,
	type ReleaseInfo,
} from "@/features/update";
import { zh } from "@/i18n/zh";
import { dayjs } from "@/lib/date";
import { useTheme } from "@/theme";

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
	const [download, setDownload] = useState<DownloadState>({ phase: "idle" });
	const [installBlocked, setInstallBlocked] = useState(false);

	// 进入页面即强制检查一次（绕过 6h 缓存，手动入口的语义就是"现在查"）
	useEffect(() => {
		void query.refetch();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

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
		switch (status.state) {
			case "checking":
				return (
					<View style={styles.statusBlock}>
						<ActivityIndicator color={colors.primary} />
						<Text style={{ color: colors.textSecondary, fontSize: 14 }}>
							{zh.update.checking}
						</Text>
					</View>
				);
			case "error":
				return (
					<View style={styles.statusBlock}>
						<Icon name="circle-question-mark" size={40} color={colors.textSecondary} />
						<Text style={{ color: colors.textSecondary, fontSize: 14 }}>
							{zh.update.checkFailed}
						</Text>
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
});
