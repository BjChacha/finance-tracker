import { useEffect } from "react";
import { AppState } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { runAutoReportsIfNeeded } from "./auto-generate";

/**
 * Generates the report for a just-closed period on the first launch after it ended.
 *
 * Mounted at the app root next to the other background runners. The delay lets startup
 * migrations, seeding and the recurring catch-up settle first; failures stay silent because a
 * missing key or offline device is a normal state and the scheduler backs off on its own.
 */
export function ReportsRunner() {
	const queryClient = useQueryClient();
	useEffect(() => {
		const run = () => {
			if (AppState.currentState !== "active") return;
			void runAutoReportsIfNeeded()
				.then((result) => {
					if (result && result.generated.length > 0) {
						void queryClient.invalidateQueries({ queryKey: ["reports"] });
					}
				})
				.catch((error: unknown) => {
					console.warn("[reports] automatic generation skipped", error);
				});
		};
		const initial = setTimeout(run, 12_000);
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
