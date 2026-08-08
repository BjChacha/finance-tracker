import { useRootNavigationState } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import type { LayoutChangeEvent } from "react-native";
import { completeAppLaunch } from "@/lib/quickKeypad";

type AppLaunchGateOptions = {
	navigationFallbackReady?: boolean;
};

export function useAppLaunchGate({
	navigationFallbackReady = false,
}: AppLaunchGateOptions = {}) {
	const rootNavigationState = useRootNavigationState();
	const [rootLayoutReady, setRootLayoutReady] = useState(false);
	const completedRef = useRef(false);
	const navigationReady =
		navigationFallbackReady || Boolean(rootNavigationState?.key);

	const handleRootLayout = useCallback((_event: LayoutChangeEvent) => {
		setRootLayoutReady(true);
	}, []);

	useEffect(() => {
		if (completedRef.current || !navigationReady || !rootLayoutReady) return;

		let cancelled = false;
		let firstFrame: number | null = null;
		let secondFrame: number | null = null;
		firstFrame = requestAnimationFrame(() => {
			firstFrame = null;
			secondFrame = requestAnimationFrame(() => {
				secondFrame = null;
				if (cancelled || completedRef.current) return;
				completedRef.current = true;
				completeAppLaunch();
			});
		});

		return () => {
			cancelled = true;
			if (firstFrame !== null) cancelAnimationFrame(firstFrame);
			if (secondFrame !== null) cancelAnimationFrame(secondFrame);
		};
	}, [navigationReady, rootLayoutReady]);

	return handleRootLayout;
}
