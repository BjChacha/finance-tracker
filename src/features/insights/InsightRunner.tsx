import { useEffect } from "react";
import { AppState } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { generateInsightsIfNeeded } from "./repository";

/**
 * 生成/刷新本地规则洞察（零 LLM 成本）。
 *
 * 与 ReportsRunner 并列挂在应用根上：启动延迟 15 秒（让迁移、种子与周期补账先完成），
 * 回前台再试；generateInsightsIfNeeded 自带按数据版本 + 月份的节流，不忙算。
 * 生成失败保持静默（下次再试），不干扰用户。
 */
export function InsightRunner() {
	const queryClient = useQueryClient();
	useEffect(() => {
		const run = () => {
			if (AppState.currentState !== "active") return;
			void generateInsightsIfNeeded()
				.then((regenerated) => {
					if (regenerated) {
						void queryClient.invalidateQueries({ queryKey: ["insights"] });
					}
				})
				.catch((error: unknown) => {
					console.warn("[insights] generation skipped", error);
				});
		};
		const initial = setTimeout(run, 15_000);
		const subscription = AppState.addEventListener("change", (state) => {
			if (state === "active") run();
		});
		return () => {
			clearTimeout(initial);
			subscription.remove();
		};
	}, [queryClient]);
	return null;
}
