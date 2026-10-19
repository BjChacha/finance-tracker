/**
 * 在线更新检查：查询 GitHub Releases 最新版本并与本地版本比较。
 *
 * 仓库为公开仓库，未认证即可访问（限流 60 次/h/IP，对个人应用足够）。
 * 版本比较是纯函数便于单测；API 响应用 zod 解析（项目 I/O 边界惯例）。
 */
import Constants from "expo-constants";
import { z } from "zod";

/** GitHub 仓库（owner/repo），发布脚本 scripts/release.mjs 发布到同一目标 */
export const GITHUB_REPO = "BjChacha/finance-tracker";

const LATEST_RELEASE_API = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;

/** 最新 Release 的关键信息（从 GitHub API 响应中挑出更新所需的字段） */
export type ReleaseInfo = {
	/** release tag，如 v0.0.2 */
	tag: string;
	/** 去掉 v 前缀的版本号，如 0.0.2 */
	version: string;
	/** release 名称（可为空） */
	name: string | null;
	/** release notes 正文（作为 changelog 展示） */
	notes: string;
	/** APK 资源的浏览器下载地址（302 到 CDN，DownloadTask 会跟随重定向） */
	apkUrl: string;
	/** APK 字节数（进度总量） */
	apkSize: number;
	/** 发布时间 ISO 字符串 */
	publishedAt: string;
};

/** 把 "v0.0.2" / "0.0.2" 解析为 [0, 0, 2]；非 x.y.z 形式返回 null */
export function parseVersion(tag: string): number[] | null {
	const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(tag.trim());
	if (!m) return null;
	return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/** remote 是否比 local 新（逐段数字比较；任一无法解析视为不更新，宁可漏报不误报） */
export function isNewer(remote: string, local: string): boolean {
	const r = parseVersion(remote);
	const l = parseVersion(local);
	if (!r || !l) return false;
	for (let i = 0; i < 3; i++) {
		if (r[i] !== l[i]) return r[i] > l[i];
	}
	return false;
}

/** release 里的 .apk 资源（assets 元素只校验更新所需字段） */
const apkAssetSchema = z.object({
	name: z.string().regex(/\.apk$/i),
	browser_download_url: z.string(),
	size: z.number().catch(0),
});

const releaseSchema = z.object({
	tag_name: z.string(),
	name: z.string().nullable().catch(null),
	body: z.string().catch(""),
	published_at: z.string().catch(""),
	assets: z.array(z.unknown()).catch([]),
});

/**
 * 从 GitHub API 的 release JSON 解析出 {@link ReleaseInfo}。
 * tag 非 x.y.z 或找不到 .apk 资源时抛错（说明该 release 不是合法发布产物）。
 */
export function parseLatestRelease(json: unknown): ReleaseInfo {
	const parsed = releaseSchema.safeParse(json);
	if (!parsed.success) {
		throw new Error("Malformed GitHub release payload");
	}
	const tag = parsed.data.tag_name.trim();
	if (!parseVersion(tag)) {
		throw new Error(`Release tag is not x.y.z semver: ${tag || "(missing)"}`);
	}
	const apk = parsed.data.assets
		.map((asset) => apkAssetSchema.safeParse(asset))
		.find((result) => result.success)?.data;
	if (!apk) throw new Error(`Release ${tag} has no .apk asset`);
	return {
		tag,
		version: tag.replace(/^v/, ""),
		name: parsed.data.name,
		notes: parsed.data.body,
		apkUrl: apk.browser_download_url,
		apkSize: apk.size,
		publishedAt: parsed.data.published_at,
	};
}

/** 拉取最新 release；网络错误/HTTP 非 2xx/解析失败均抛错，由调用方决定静默或提示 */
export async function fetchLatestRelease(): Promise<ReleaseInfo> {
	const res = await fetch(LATEST_RELEASE_API, {
		headers: { Accept: "application/vnd.github+json" },
	});
	if (!res.ok) throw new Error(`GitHub API responded ${res.status}`);
	return parseLatestRelease(await res.json());
}

/** 当前应用版本（app.json 的 expo.version，构建时内联进 bundle） */
export function getCurrentVersion(): string {
	return Constants.expoConfig?.version ?? "0.0.0";
}
