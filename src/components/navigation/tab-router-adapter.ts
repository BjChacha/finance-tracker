import { useMemo, type ReactNode } from "react";
import { useTabsWithTriggers } from "expo-router/ui";
import {
	TAB_DEFINITIONS,
	isTabRouteName,
	type TabRouteName,
} from "./tab-pager-machine";
import type { TabRouterContract } from "./tab-pager";

export type { TabSceneSpec } from "./tab-pager";

/** Expo Router does not export ScreenTrigger, so infer it from the hook. */
type ScreenTrigger = NonNullable<
	Parameters<typeof useTabsWithTriggers>[0]
>["triggers"][number];

/**
 * Isolates Expo Router's experimental headless tabs API from the app shell.
 * The router owns descriptors, URLs, deep links, focus, and back behavior.
 * TAB_DEFINITIONS owns visual order, while TabRouterContract exposes only
 * navigation writes and preventable tab events to the pager coordinator.
 */
export function useHeadlessTabRouter() {
	const triggers = useMemo<ScreenTrigger[]>(
		() =>
			TAB_DEFINITIONS.map((definition) => ({
				type: "internal" as const,
				name: definition.name,
				href: definition.href,
			})),
		[],
	);

	const tabs = useTabsWithTriggers({
		triggers,
		backBehavior: "none",
	});

	const { state, descriptors, navigation, NavigationContent } = tabs;

	const routeKeyFor = useMemo(
		() =>
			(name: TabRouteName): string =>
				state.routes.find((route) => route.name === name)?.key ?? name,
		[state.routes],
	);

	const routerContract = useMemo<TabRouterContract>(
		() => ({
			routeKeyFor,
			jumpTo: (name: TabRouteName) => {
				navigation.jumpTo(name);
			},
			emitTabPress: (target: string): boolean => {
				const event = navigation.emit({
					type: "tabPress",
					target,
					canPreventDefault: true,
				});
				return Boolean(event.defaultPrevented);
			},
			emitTabLongPress: (target: string) => {
				navigation.emit({ type: "tabLongPress", target });
			},
		}),
		[navigation, routeKeyFor],
	);

	const scenes = useMemo(() => {
		return TAB_DEFINITIONS.map((definition) => ({
			name: definition.name,
			render: (): ReactNode => {
				const key = routeKeyFor(definition.name);
				const descriptor = descriptors[key];
				return descriptor !== undefined ? descriptor.render() : null;
			},
		}));
	}, [descriptors, routeKeyFor]);

	const activeRoute = state.routes[state.index];
	const activeRouteName: TabRouteName =
		activeRoute !== undefined && isTabRouteName(activeRoute.name)
			? activeRoute.name
			: "index";

	return { scenes, activeRouteName, routerContract, NavigationContent };
}
