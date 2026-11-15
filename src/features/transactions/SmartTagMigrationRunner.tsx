import { useEffect } from "react";
import { usePathname } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { showDialog, showToast } from "@/components/dialog";
import { zh } from "@/i18n/zh";
import { invalidateTransactionData } from "./invalidate";
import {
	countLegacySmartNoteTransactions,
	getSmartTagMigrationDecision,
	migrateLegacySmartNotes,
	setSmartTagMigrationDecision,
} from "./smart-tag-migration";
import { SMART_TAG } from "./tags";

const copy = zh.tx.smartTagMigration;

/**
 * 只在应用常规页签上询问。
 *
 * 桌面快捷方式（记一笔 / 一句话记账）会把 App 拉起在一个透明弹层上，交接时序很敏感：
 * 启动 800ms 插一个模态弹窗，用户再点「立即转换」跑几十条 UPDATE，就可能把交接打断，
 * 留下半截布局（sheet 已是全高，表单内容还停在交接前的小尺寸）。
 * 落到页签上再问；快捷方式里不问，留到下次正常启动。
 */
const ASKABLE_ROUTES = new Set(["/", "/ledger", "/personal-assets", "/profile"]);

/**
 * 升级后的存量数据询问：旧版把「【智能识别】」写在备注里，新版改用交易标签。
 *
 * 只在还没做过决定、且库里确实存在旧文本时询问一次：用户选「立即转换」才改写数据，
 * 选「暂不转换」也记下决定，之后不再打扰。不做静默迁移——改写用户的历史备注
 * 必须得到同意。
 */
export function SmartTagMigrationRunner() {
	const queryClient = useQueryClient();
	const pathname = usePathname();
	const askable = ASKABLE_ROUTES.has(pathname);

	useEffect(() => {
		if (!askable) return;
		let cancelled = false;

		const convert = () => {
			void (async () => {
				try {
					const converted = await migrateLegacySmartNotes();
					await setSmartTagMigrationDecision("converted");
					await invalidateTransactionData(queryClient);
					if (converted > 0) showToast(copy.done(converted, SMART_TAG));
				} catch (error) {
					showDialog(
						zh.common.error,
						error instanceof Error ? error.message : String(error),
					);
				}
			})();
		};

		const run = async () => {
			if (await getSmartTagMigrationDecision()) return;
			const pending = await countLegacySmartNoteTransactions();
			if (cancelled || pending === 0) {
				if (!cancelled) await setSmartTagMigrationDecision("none");
				return;
			}
			showDialog(
				copy.title,
				copy.message(pending, SMART_TAG),
				[
					{
						text: copy.later,
						style: "cancel",
						onPress: () => {
							void setSmartTagMigrationDecision("declined");
						},
					},
					{ text: copy.convert, onPress: convert },
				],
				// 必须选一个按钮，避免遮罩/返回键关掉后没有任何决定、下次又弹
				{ cancelable: false },
			);
		};

		// 让首帧与启动期的其它迁移先落地，弹窗不至于跟启动动画抢屏
		const timer = setTimeout(() => {
			void run().catch((error: unknown) => {
				console.warn("[transactions] smart tag migration check skipped", error);
			});
		}, 800);

		return () => {
			cancelled = true;
			clearTimeout(timer);
		};
	}, [askable, queryClient]);

	return null;
}
