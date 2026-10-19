/**
 * 更新检查的 React Query 封装与 UI 状态派生。
 *
 * 启动静默检查与手动检查共用同一 queryKey（缓存 6h），不会重复请求 GitHub API。
 * 「忽略」仅内存态：本次会话不再弹卡片，重启后重新提醒——避免引入持久化设施。
 */
import { useQuery } from "@tanstack/react-query";
import {
	fetchLatestRelease,
	getCurrentVersion,
	isNewer,
	type ReleaseInfo,
} from "./checker";

export const LATEST_RELEASE_KEY = ["latestRelease"] as const;

/** 查询缓存时长：6h 内启动检查直接用缓存 */
const STALE_MS = 6 * 60 * 60 * 1000;

/** 最新 release 查询；refetch() 可绕过缓存强制刷新（手动「检查更新」用） */
export function useLatestRelease() {
	return useQuery({
		queryKey: LATEST_RELEASE_KEY,
		queryFn: fetchLatestRelease,
		staleTime: STALE_MS,
		retry: 1,
	});
}

/** 供 UI 消费的更新状态（由查询结果 + 本地版本比较派生） */
export type UpdateStatus =
	| { state: "idle" }
	| { state: "checking" }
	| { state: "upToDate"; current: string }
	| { state: "available"; current: string; release: ReleaseInfo }
	| { state: "error" };

/** 从查询对象派生 {@link UpdateStatus}；查询失败静默降级为 error 态 */
export function deriveUpdateStatus(query: {
	isPending: boolean;
	isError: boolean;
	data?: ReleaseInfo;
}): UpdateStatus {
	if (query.isPending) return { state: "checking" };
	if (query.isError || !query.data) return { state: "error" };
	const current = getCurrentVersion();
	if (isNewer(query.data.version, current)) {
		return { state: "available", current, release: query.data };
	}
	return { state: "upToDate", current };
}

// —— 「忽略新版本」标记（模块级内存态，跨页面共享） ——

let dismissedVersion: string | null = null;

/** 用户点「忽略」后，本次会话个人页不再显示该版本的更新卡片 */
export function dismissUpdate(version: string): void {
	dismissedVersion = version;
}

/** 该版本是否已被用户忽略 */
export function isUpdateDismissed(version: string): boolean {
	return dismissedVersion === version;
}
