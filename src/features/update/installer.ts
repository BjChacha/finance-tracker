/**
 * APK 下载与安装（仅 Android）。
 *
 * 下载用 expo-file-system 新 API 的 DownloadTask（进度回调）；
 * 安装必须走 content:// URI（targetSdk 24+ 禁止跨应用读 file://），
 * 由 expo-file-system 已注册的 FileProvider 提供（覆盖 cache 目录）。
 * Android 8+ 需用户授予「安装未知应用」权限，未授权时安装 Intent 会被系统拦截，
 * 调用方捕获后可用 {@link openInstallPermissionSettings} 引导用户去系统设置授权。
 */
import Constants from "expo-constants";
import { File, Paths } from "expo-file-system";
import { getContentUriAsync } from "expo-file-system/legacy";
import * as IntentLauncher from "expo-intent-launcher";
import { Platform } from "react-native";

const APK_MIME = "application/vnd.android.package-archive";
/** android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION */
const FLAG_GRANT_READ_URI_PERMISSION = 1;

function assertAndroid(): void {
	if (Platform.OS !== "android") {
		throw new Error("Online update is only supported on Android");
	}
}

/**
 * 下载新版本 APK 到缓存目录。
 *
 * @param release 目标 release（提供下载地址与版本号，版本号用于命名缓存文件）
 * @param onProgress 进度回调（已写字节 / 总字节；总字节可能为 -1，服务端未给长度时）
 * @returns 下载完成的本地文件 URI（file://）
 */
export async function downloadApk(
	release: { apkUrl: string; version: string },
	onProgress: (loaded: number, total: number) => void,
): Promise<string> {
	assertAndroid();
	const dest = new File(Paths.cache, `finance-tracker-${release.version}.apk`);
	const task = File.createDownloadTask(release.apkUrl, dest, {
		onProgress: ({ bytesWritten, totalBytes }) => onProgress(bytesWritten, totalBytes),
	});
	const file = await task.downloadAsync();
	if (!file) throw new Error("APK download did not complete");
	return file.uri;
}

/**
 * 调起系统安装器安装已下载的 APK。
 *
 * 前台必须有能力读该文件：Intent 携带 GRANT_READ_URI_PERMISSION，
 * content:// 由 expo-file-system 的 FileProvider 签发。未授予「安装未知应用」
 * 权限时系统直接拦截（可能抛错，也可能拉起授权页，行为因厂商而异）。
 */
export async function installApk(fileUri: string): Promise<void> {
	assertAndroid();
	const contentUri = await getContentUriAsync(fileUri);
	await IntentLauncher.startActivityAsync("android.intent.action.VIEW", {
		data: contentUri,
		type: APK_MIME,
		flags: FLAG_GRANT_READ_URI_PERMISSION,
	});
}

/** 跳到系统「安装未知应用」授权页（针对本应用），供安装失败时引导 */
export async function openInstallPermissionSettings(): Promise<void> {
	assertAndroid();
	const pkg = Constants.expoConfig?.android?.package;
	await IntentLauncher.startActivityAsync(
		IntentLauncher.ActivityAction.MANAGE_UNKNOWN_APP_SOURCES,
		pkg ? { data: `package:${pkg}` } : undefined,
	);
}
