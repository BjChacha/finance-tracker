import {
	forwardRef,
	useCallback,
	useEffect,
	useImperativeHandle,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
	type ForwardedRef,
} from "react";
import {
	Alert,
	Dimensions,
	Keyboard,
	KeyboardAvoidingView,
	Modal,
	Platform,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	type LayoutChangeEvent,
	type TextInput,
	View,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { usePreventRemove } from "expo-router/react-navigation";
import Animated, {
	Easing,
	FadeIn,
	FadeOut,
	interpolateColor,
	SlideInDown,
	SlideOutDown,
	useAnimatedStyle,
	useReducedMotion,
	useSharedValue,
	withTiming,
	type EntryAnimationsValues,
	type EntryExitAnimationFunction,
	type ExitAnimationsValues,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/components/Icon";
import { SingleLineTextInput } from "@/components/single-line-text-input";
import type { TransactionType } from "@/db/schema";
import { useAccountBalances } from "@/features/accounts";
import { useCategoryTree, type CategoryNode } from "@/features/categories";
import { useProjects } from "@/features/projects";
import { useRates } from "@/features/currency";
import {
	orderByScore,
	pickAutoSelect,
	pickAutoSelectId,
	pickAutoSelectTransferPair,
	transferDestinationScores,
	transferSourceScores,
	useAccountSuggestion,
	useCategorySuggestion,
} from "@/features/suggestions";
import { zh } from "@/i18n/zh";
import { applyCalcInput, evalMoneyExpr } from "@/lib/calc";
import { dayjs, todayKey } from "@/lib/date";
import { resolveIconKey } from "@/lib/iconResolvers";
import {
	currencySymbol,
	formatCents,
	formatCentsWithSymbol,
	parseRateToScaled,
	RATE_SCALE,
} from "@/lib/money";
import { isQuickKeypadAvailable, openKeypad } from "@/lib/quickKeypad";
import { useProgressiveMount } from "@/lib/use-progressive-mount";
import { motion, useTheme, type AppTheme } from "@/theme";
import { computeAmountPreview } from "../amountPreview";
import { buildVisibleCategoryTree } from "../visible-categories";
import { CategoryPickerModal } from "./CategoryPickerModal";
import { CurrencyPickerModal } from "./CurrencyPickerModal";
import { AmountKeypadPanel } from "./AmountKeypadPanel";
import { DateTimeSemanticCards } from "./date-time-semantic-cards";
import {
	TRANSACTION_TYPE_TABS,
	TransactionTypeSegment,
} from "./TransactionTypeSegment";
import { promptSwitchOnNegative } from "../promptSwitchOnNegative";
import { isQuickAddFormInteractive } from "../quickAddPerformance";
import {
	buildTransactionInput,
	type TransactionValidationError,
} from "../transaction-input";
import {
	animateTypeTransition,
	completeTypeTransitionState,
	createTypeTransition,
	growTypeTransition,
	TRANSACTION_TYPE_INDEX,
	type TypeTransitionState,
} from "../transaction-type-transition";
import type { TxInput } from "../repository";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export type TxFormInitialValues = {
	type: TransactionType;
	amount: number;
	fee: number;
	accountId: string;
	toAccountId: string | null;
	categoryId: string | null;
	projectId: string | null;
	/** 'YYYY-MM-DD'（兼容旧调用方；优先取 dateMs） */
	dateKey?: string;
	/** 编辑时携带的完整 Unix 毫秒时间戳，用以保留时间分量 */
	dateMs?: number;
	note: string;
	/** 交易币种 ISO code，默认 CNY */
	currency?: string;
	/** Original rate snapshot. Preserve it while the transaction currency is unchanged. */
	exchangeRate?: number;
};

type Props = {
	/** 预填初值。快捷记账等「带预填金额的新建」必须同时显式传 mode="create"。 */
	initialValues?: Partial<TxFormInitialValues>;
	/** create：启用分类兜底与智能推荐；edit：两者关闭。缺省按 initialValues ? 'edit' : 'create' 推断。 */
	mode?: "create" | "edit";
	submitting?: boolean;
	onInteractive?: () => void;
	renderMode?: "summary" | "staged-editor" | "editor";
	/**
	 * Frames spent on each staged-editor step. Background prewarming keeps the default so
	 * it stays out of the way, while a user-facing launch lowers it to reach the save
	 * button sooner.
	 */
	stageFramesPerStep?: number;
	summaryValues?: {
		accountName?: string | null;
		toAccountName?: string | null;
		categoryName?: string | null;
		categoryIcon?: string | null;
		categoryColor?: string | null;
	};
	sessionKey?: string | number | null;
	onSessionHydrated?: (sessionKey: string | number) => void;
	onEditorReady?: () => void;
	/** 客户端幂等键（如快捷记账 handoffId）：重复提交返回既有记录 */
	clientTag?: string | null;
	onSubmit: (input: TxInput) => void | Promise<void>;
};

export interface TransactionFormHandle {
	/** Prepare dismiss: close any open overlay/keyboard. No longer auto-saves; returns true. */
	prepareDismiss: () => Promise<boolean>;
	/** Close any open overlay (keypad/pickers/submenu/keyboard). Returns true if one was open (and closed); false if none. */
	closeOverlaysIfAny: () => boolean;
	/** Submit current form values. Closes overlays first (returns false if any was open). Returns true on successful submit. */
	save: () => Promise<boolean>;
}

/** 表单分类胶囊渐进挂载上限；分类已全部呈现时不显示「全部分类」入口 */
const VISIBLE_COUNT = 12;

function TransactionFormComponent(
	{
		initialValues,
		mode: modeProp,
		submitting,
		onInteractive,
		renderMode = "editor",
		stageFramesPerStep = 4,
		summaryValues,
		sessionKey = null,
		onSessionHydrated,
		onEditorReady,
		clientTag,
		onSubmit,
	}: Props,
	ref: ForwardedRef<TransactionFormHandle>,
) {
	const theme = useTheme();
	const { colors } = theme;
	const insets = useSafeAreaInsets();
	const reduceMotion = useReducedMotion();
	const mode = modeProp ?? (initialValues ? "edit" : "create");
	// 原始交易类型/分类（仅编辑模式有意义）：切换类型切回原类型时恢复原分类。
	const originalType = initialValues?.type;
	const originalCategoryId = initialValues?.categoryId ?? null;
	const progressiveEditorStage = useProgressiveMount(
		renderMode === "staged-editor",
		15,
		stageFramesPerStep,
	);
	const editorStage =
		renderMode === "summary"
			? 0
			: renderMode === "staged-editor"
				? progressiveEditorStage
				: 15;

	const [type, setType] = useState<TransactionType>(
		initialValues?.type ?? "expense",
	);
	const [typeTransition, setTypeTransition] =
		useState<TypeTransitionState | null>(null);
	const typeTransitionRef = useRef<TypeTransitionState | null>(null);
	const typeTransitionIdRef = useRef(0);
	const typePageWidthRef = useRef(0);
	const typePageHeightRef = useRef(0);
	const typeVisualPosition = useSharedValue(
		TRANSACTION_TYPE_INDEX[initialValues?.type ?? "expense"],
	);
	const [amountText, setAmountText] = useState(
		initialValues?.amount != null
			? formatCents(initialValues.amount, { grouping: false })
			: "",
	);
	const [feeText, setFeeText] = useState(
		initialValues?.fee != null && initialValues.fee > 0
			? formatCents(initialValues.fee, { grouping: false })
			: "",
	);
	const [accountId, setAccountId] = useState<string | null>(
		initialValues?.accountId ?? null,
	);
	const [toAccountId, setToAccountId] = useState<string | null>(
		initialValues?.toAccountId ?? null,
	);
	const [categoryId, setCategoryId] = useState<string | null>(
		initialValues?.categoryId ?? null,
	);
	const [projectId, setProjectId] = useState<string | null>(
		initialValues?.projectId ?? null,
	);
	const [dateText, setDateText] = useState(() => {
		if (initialValues?.dateMs != null)
			return dayjs(initialValues.dateMs).format("YYYY-MM-DD");
		return initialValues?.dateKey ?? todayKey();
	});
	const [timeText, setTimeText] = useState(() =>
		initialValues?.dateMs != null
			? dayjs(initialValues.dateMs).format("HH:mm")
			: dayjs().format("HH:mm"),
	);
	const [datePickerOpen, setDatePickerOpen] = useState(false);
	const [tempDate, setTempDate] = useState<Date>(() => new Date());
	const [timePickerOpen, setTimePickerOpen] = useState(false);
	const [tempTime, setTempTime] = useState<Date>(() => new Date());
	const [note, setNote] = useState(initialValues?.note ?? "");
	const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);
	const [submenu, setSubmenu] = useState<{
		node: CategoryNode;
		x: number;
		y: number;
	} | null>(null);
	const badgeRefs = useRef<Record<string, View | null>>({});
	// Progressive mounting fades individual blocks; type changes slide the keyed page shell.
	// Track whether the type changed because later stages no longer know the first render source.
	const typeSwitchedRef = useRef(false);
	const replaceAmountOnNextNumericRef = useRef(false);
	// The native keypad's OK sits exactly where the form's save button appears once the
	// keypad closes (no exit animation). A habitual second tap would therefore submit the
	// form and exit the quick-add flow; ignore save taps for a beat after a keypad close.
	const nativeKeypadClosedAtRef = useRef(0);
	const [keypadVisible, setKeypadVisible] = useState(
		Platform.OS !== "android" && !initialValues,
	);
	// 交易币种（默认 CNY）+ 币种选择器开关
	const [currency, setCurrency] = useState(initialValues?.currency ?? "CNY");
	const [currencyPickerOpen, setCurrencyPickerOpen] = useState(false);
	const [keyboardVisible, setKeyboardVisible] = useState(false);
	const [keyboardHeight, setKeyboardHeight] = useState(0);
	const scrollYRef = useRef(0);
	const noteInputRef = useRef<TextInput>(null);
	const feeInputRef = useRef<TextInput>(null);
	const activeInputRef = useRef<TextInput | null>(null);
	// 智能分类推荐:金额确认快照 + 用户手动选过分类的标记(手动选过后不再自动改选)
	const [confirmedAmountCents, setConfirmedAmountCents] = useState<
		number | null
	>(null);
	const [categoryTouched, setCategoryTouched] = useState(
		mode === "edit" && initialValues?.categoryId != null,
	);
	const [accountTouched, setAccountTouched] = useState(
		initialValues?.accountId != null || initialValues?.toAccountId != null,
	);
	const scrollRef = useRef<ScrollView>(null);
	const hydratedSessionKeyRef = useRef<string | number | null>(null);
	const reportedSessionKeyRef = useRef<string | number | null>(null);
	const [hydratedSessionKey, setHydratedSessionKey] = useState<
		string | number | null
	>(null);
	const editorReadyReportedRef = useRef(false);
	const completeTypeTransition = useCallback((transitionId: number) => {
		const current = typeTransitionRef.current;
		const next = completeTypeTransitionState(current, transitionId);
		if (next === current) return;
		typeTransitionRef.current = next;
		setTypeTransition(next);
	}, []);
	const handleTypePageLayout = useCallback((event: LayoutChangeEvent) => {
		const { width, height } = event.nativeEvent.layout;
		if (width > 0) typePageWidthRef.current = width;
		if (height > 0) typePageHeightRef.current = height;
		const current = typeTransitionRef.current;
		if (!current || height <= current.minHeight) return;
		const next = growTypeTransition(current, height);
		if (next === current) return;
		typeTransitionRef.current = next;
		setTypeTransition((previous) =>
			previous?.id === next.id ? next : previous,
		);
	}, []);

	useLayoutEffect(() => {
		if (sessionKey === null || hydratedSessionKeyRef.current === sessionKey)
			return;
		hydratedSessionKeyRef.current = sessionKey;
		reportedSessionKeyRef.current = null;
		const nextDate =
			initialValues?.dateMs != null
				? dayjs(initialValues.dateMs)
				: dayjs(initialValues?.dateKey ?? todayKey(), "YYYY-MM-DD");
		const nextType = initialValues?.type ?? "expense";
		typeTransitionIdRef.current += 1;
		typeTransitionRef.current = null;
		setTypeTransition(null);
		typeVisualPosition.set(TRANSACTION_TYPE_INDEX[nextType]);
		setType(nextType);
		setAmountText(
			initialValues?.amount != null
				? formatCents(initialValues.amount, { grouping: false })
				: "",
		);
		setFeeText(
			initialValues?.fee != null && initialValues.fee > 0
				? formatCents(initialValues.fee, { grouping: false })
				: "",
		);
		setAccountId(initialValues?.accountId ?? null);
		setToAccountId(initialValues?.toAccountId ?? null);
		setCategoryId(initialValues?.categoryId ?? null);
		setProjectId(initialValues?.projectId ?? null);
		setDateText(nextDate.format("YYYY-MM-DD"));
		setTimeText(
			initialValues?.dateMs != null
				? nextDate.format("HH:mm")
				: dayjs().format("HH:mm"),
		);
		setTempDate(nextDate.toDate());
		setTempTime(nextDate.toDate());
		setNote(initialValues?.note ?? "");
		setCurrency(initialValues?.currency ?? "CNY");
		setDatePickerOpen(false);
		setTimePickerOpen(false);
		setCategoryPickerOpen(false);
		setCurrencyPickerOpen(false);
		setSubmenu(null);
		setKeypadVisible(false);
		setKeyboardVisible(false);
		setConfirmedAmountCents(null);
		setCategoryTouched(mode === "edit" && initialValues?.categoryId != null);
		setAccountTouched(
			initialValues?.accountId != null || initialValues?.toAccountId != null,
		);
		replaceAmountOnNextNumericRef.current = false;
		Keyboard.dismiss();
		scrollRef.current?.scrollTo({ y: 0, animated: false });
		setHydratedSessionKey(sessionKey);
	}, [initialValues, sessionKey]);

	useLayoutEffect(() => {
		if (
			sessionKey === null ||
			hydratedSessionKey !== sessionKey ||
			reportedSessionKeyRef.current === sessionKey
		) {
			return;
		}
		reportedSessionKeyRef.current = sessionKey;
		onSessionHydrated?.(sessionKey);
	}, [hydratedSessionKey, onSessionHydrated, sessionKey]);

	useLayoutEffect(() => {
		if (editorStage < 15 || editorReadyReportedRef.current) return;
		editorReadyReportedRef.current = true;
		onEditorReady?.();
	}, [editorStage, onEditorReady]);

	// 小键盘/币种选择器弹出时，返回键（硬件返回 / header 返回 / modal 滑动）仅收起当前弹层；收起后恢复默认返回。
	usePreventRemove(keypadVisible || currencyPickerOpen, () => {
		setKeypadVisible(false);
		setCurrencyPickerOpen(false);
	});

	const accountsQuery = useAccountBalances();
	const projectsQuery = useProjects();
	const categoryType = type;
	const categoryQuery = useCategoryTree(categoryType);
	const ratesQuery = useRates();
	const accounts = accountsQuery.data ?? [];
	const projects = projectsQuery.data ?? [];
	const categoryTree = categoryQuery.data ?? [];
	const ratesCache = ratesQuery.data;
	const [formLaidOut, setFormLaidOut] = useState(false);
	const interactiveReported = useRef(false);
	const formInteractive = isQuickAddFormInteractive({
		formLaidOut,
		accountsFetched: accountsQuery.isFetched,
		projectsFetched: projectsQuery.isFetched,
		categoriesFetched: categoryQuery.isFetched,
		ratesFetched: ratesQuery.isFetched,
	});

	useEffect(() => {
		const showSubscription = Keyboard.addListener("keyboardDidShow", (e) => {
			setKeyboardVisible(true);
			setKeyboardHeight(e.endCoordinates.height);
		});
		const hideSubscription = Keyboard.addListener("keyboardDidHide", () => {
			setKeyboardVisible(false);
			setKeyboardHeight(0);
		});
		return () => {
			showSubscription.remove();
			hideSubscription.remove();
		};
	}, []);

	// Android 上 sheet 是 absolute+translateY 浮层，KeyboardAvoidingView 对其失效：
	// keyboardDidShow 在键盘起弹即触发，立即测量并启动动画滚动，
	// 让内容上移与键盘弹出动画并行（不再等 300ms 后才滚，避免「先弹键盘再挪位」）。
	useEffect(() => {
		if (!keyboardVisible || keyboardHeight === 0) return;
		activeInputRef.current?.measureInWindow((_x, y, _w, h) => {
			if (h === 0) return;
			const kbTop = Dimensions.get("screen").height - keyboardHeight;
			const overlap = y + h - kbTop + 48;
			if (overlap > 0 && scrollRef.current) {
				scrollRef.current.scrollTo({
					y: scrollYRef.current + overlap,
					animated: true,
				});
			}
		});
	}, [keyboardVisible, keyboardHeight]);

	// saveFooter 随键盘平滑上移/回落（时长对齐键盘面板），替代瞬时跳变。
	const saveFooterTranslateY = useSharedValue(0);
	useEffect(() => {
		saveFooterTranslateY.value = withTiming(
			keyboardVisible && keyboardHeight > 0 ? -keyboardHeight : 0,
			{ duration: motion.enter, easing: Easing.out(Easing.cubic) },
		);
	}, [keyboardHeight, keyboardVisible, saveFooterTranslateY]);
	const saveFooterAnimatedStyle = useAnimatedStyle(() => ({
		transform: [{ translateY: saveFooterTranslateY.value }],
	}));

	useEffect(() => {
		if (!onInteractive || interactiveReported.current || !formInteractive)
			return;
		const frame = requestAnimationFrame(() => {
			if (interactiveReported.current) return;
			interactiveReported.current = true;
			onInteractive();
		});
		return () => cancelAnimationFrame(frame);
	}, [formInteractive, onInteractive]);

	// 账户推荐仅新建启用（编辑保留原始账户）；分类推荐新建与编辑均启用，
	// 以便编辑时切换类型能像新建一样预测分类（切回原始类型则恢复原分类）。
	const suggestEnabled = mode === "create";
	const categorySuggestEnabled = mode === "create" || mode === "edit";
	const suggestScores = useCategorySuggestion({
		type: categoryType,
		amountCents: confirmedAmountCents,
		enabled: categorySuggestEnabled,
	});
	// 分类栏固定顺序（不随智能推荐/编辑态重排）；智能预选仅高亮，选中分类
	// 不在前缀内时由 visibleTree 末位替换保证可见。
	const selectedCategory = useMemo(() => {
		for (const node of categoryTree) {
			if (node.id === categoryId) return node;
			const child = node.children.find(
				(candidate) => candidate.id === categoryId,
			);
			if (child) return child;
		}
		return null;
	}, [categoryId, categoryTree]);
	const { accountScores, transferPairs } = useAccountSuggestion({
		type,
		amountCents: confirmedAmountCents,
		enabled: suggestEnabled,
	});
	const validAccountIds = useMemo(
		() => new Set(accounts.map((account) => account.id)),
		[accounts],
	);
	const sourceAccountScores = useMemo(
		() =>
			type === "transfer" ? transferSourceScores(transferPairs) : accountScores,
		[type, transferPairs, accountScores],
	);
	const orderedAccounts = useMemo(
		() => orderByScore(accounts, sourceAccountScores),
		[accounts, sourceAccountScores],
	);
	const effectiveAccountId = accountId ?? accounts[0]?.id ?? null;
	const destinationAccountScores = useMemo(
		() => transferDestinationScores(transferPairs, effectiveAccountId),
		[transferPairs, effectiveAccountId],
	);
	const orderedDestinationAccounts = useMemo(
		() =>
			orderByScore(
				accounts.filter((account) => account.id !== effectiveAccountId),
				destinationAccountScores,
			),
		[accounts, effectiveAccountId, destinationAccountScores],
	);

	// 键盘收起即视为金额确认(OK / 遮罩 / 返回键 / 切换到其他输入框皆覆盖);只收正数
	useEffect(() => {
		if (keypadVisible) return;
		const cents = evalMoneyExpr(amountText);
		setConfirmedAmountCents(cents !== null && cents > 0 ? cents : null);
	}, [keypadVisible, amountText]);

	// 记一笔默认选一个分类：优先「其他支出/收入」兜底，否则首个。新建与编辑均生效
	// （编辑切换类型后 categoryId 清空时，由此兜底再叠加智能推荐预测）。
	useEffect(() => {
		if (
			(mode === "create" || mode === "edit") &&
			categoryId === null &&
			categoryTree.length > 0
		) {
			const fallback =
				categoryTree.find((c) => c.name.startsWith("其他")) ?? categoryTree[0];
			setCategoryId(fallback.id);
		}
	}, [mode, categoryId, categoryTree]);

	// 静默预选最高分分类(含展开子分类);无命中或手动选过时不动,保留上方「其他」兜底。
	// 必须声明在兜底 effect 之后:类型切换清空 categoryId 时,两者同帧触发,预选需后执行以覆盖兜底。
	useEffect(() => {
		if (!categorySuggestEnabled || categoryTouched) return;
		const pick = pickAutoSelect(categoryTree, suggestScores);
		if (!pick) return;
		setCategoryId(pick.categoryId);
	}, [categorySuggestEnabled, categoryTouched, categoryTree, suggestScores]);

	useEffect(() => {
		if (!suggestEnabled || accountTouched) return;
		if (type === "transfer") {
			const pair = pickAutoSelectTransferPair(transferPairs, validAccountIds);
			if (!pair) return;
			setAccountId(pair.accountId);
			setToAccountId(pair.toAccountId);
			return;
		}

		const suggestedAccountId = pickAutoSelectId(accounts, accountScores);
		if (suggestedAccountId) setAccountId(suggestedAccountId);
	}, [
		suggestEnabled,
		accountTouched,
		type,
		transferPairs,
		validAccountIds,
		accounts,
		accountScores,
	]);

	const typeColor =
		type === "expense"
			? colors.expense
			: type === "income"
				? colors.income
				: colors.transfer;
	const selectedAccount =
		accounts.find((account) => account.id === effectiveAccountId) ?? null;
	const selectedDestinationAccount =
		accounts.find((account) => account.id === toAccountId) ?? null;
	const typeLabel =
		TRANSACTION_TYPE_TABS.find((tab) => tab.key === type)?.label ?? type;

	// 外币时按汇率缓存折算到本位币（CNY 视作 1.0；汇率缺失/非法时 parseRateToScaled 回退 1.0）
	const originalCurrency = initialValues?.currency ?? "CNY";
	const originalExchangeRate = initialValues?.exchangeRate;
	const exchangeRateScaled =
		mode === "edit" &&
		currency === originalCurrency &&
		Number.isSafeInteger(originalExchangeRate) &&
		(originalExchangeRate as number) > 0
			? (originalExchangeRate as number)
			: currency === "CNY"
				? RATE_SCALE
				: parseRateToScaled(String(ratesCache?.rates?.[currency] ?? ""));
	const { opPreview: preview, baseCents: basePreview } = computeAmountPreview(
		amountText,
		currency,
		exchangeRateScaled,
	);
	const inputResult = useMemo(
		() =>
			buildTransactionInput({
				type,
				amountText,
				feeText,
				accountId: effectiveAccountId,
				toAccountId,
				categoryId,
				projectId,
				dateText,
				timeText,
				note,
				currency,
				exchangeRate: exchangeRateScaled,
				clientTag,
			}),
		[
			amountText,
			categoryId,
			clientTag,
			currency,
			dateText,
			effectiveAccountId,
			exchangeRateScaled,
			feeText,
			note,
			projectId,
			timeText,
			toAccountId,
			type,
		],
	);
	const canSave = inputResult.input !== null;
	// 关闭所有弹层（键盘/各类选择器/子菜单/软键盘）；返回 true 表示有关闭。供返回/保存按钮协调。
	const closeOverlaysIfAny = useCallback((): boolean => {
		if (
			keypadVisible ||
			currencyPickerOpen ||
			datePickerOpen ||
			timePickerOpen ||
			categoryPickerOpen ||
			submenu
		) {
			setKeypadVisible(false);
			setCurrencyPickerOpen(false);
			setDatePickerOpen(false);
			setTimePickerOpen(false);
			setCategoryPickerOpen(false);
			setSubmenu(null);
			return true;
		}
		if (keyboardVisible) {
			Keyboard.dismiss();
			return true;
		}
		return false;
	}, [
		categoryPickerOpen,
		currencyPickerOpen,
		datePickerOpen,
		keyboardVisible,
		keypadVisible,
		submenu,
		timePickerOpen,
	]);

	const styles = useMemo(() => makeStyles(theme), [theme]);
	const mountedCategoryCount =
		editorStage < 2 ? 0 : Math.min(VISIBLE_COUNT, (editorStage - 1) * 2);
	// 固定顺序取前缀；选中分类（父或子）所属顶级节点不在前缀内时替换末位，
	// 被顶掉的那个分类仍可从「全部分类」中选取。
	const visibleTree = useMemo(
		() => buildVisibleCategoryTree(categoryTree, mountedCategoryCount, categoryId),
		[categoryTree, mountedCategoryCount, categoryId],
	);
	const mountedAccountCount =
		type === "transfer"
			? Math.min(orderedAccounts.length, Math.max(0, editorStage - 4) * 2)
			: editorStage < 9
				? 0
				: Math.min(orderedAccounts.length, (editorStage - 8) * 2);
	const mountedDestinationAccountCount =
		editorStage < 8
			? 0
			: Math.min(orderedDestinationAccounts.length, (editorStage - 7) * 2);
	const categoryAllStage = type === "transfer" ? 5 : 8;
	const dateStage = 12;
	const noteStage = 13;
	const projectStage = 14;
	const saveStage = 15;

	function applyTypeSwitch(next: TransactionType) {
		setType(next);
		setAccountTouched(false);
		if (next !== "transfer") setToAccountId(null);

		// 编辑模式切回原始类型：恢复原分类并锁定，防止智能推荐覆盖；
		// 否则清空让兜底+智能推荐预测（同新建逻辑）。
		if (mode === "edit" && next === originalType && originalCategoryId) {
			setCategoryId(originalCategoryId);
			setCategoryTouched(true);
		} else {
			setCategoryId(null);
			setCategoryTouched(false);
		}
	}

	function switchType(next: TransactionType) {
		if (next === type) {
			if (typeTransitionRef.current?.phase === "preparing") {
				typeTransitionIdRef.current += 1;
				typeTransitionRef.current = null;
				setTypeTransition(null);
				typeVisualPosition.set(TRANSACTION_TYPE_INDEX[type]);
			}
			return;
		}

		typeSwitchedRef.current = true;
		const transitionId = typeTransitionIdRef.current + 1;
		typeTransitionIdRef.current = transitionId;

		if (reduceMotion || typePageWidthRef.current <= 0) {
			typeTransitionRef.current = null;
			setTypeTransition(null);
			typeVisualPosition.set(TRANSACTION_TYPE_INDEX[next]);
			applyTypeSwitch(next);
			return;
		}

		const transition = createTypeTransition(
			transitionId,
			type,
			next,
			typePageHeightRef.current,
		);
		typeTransitionRef.current = transition;
		setTypeTransition(transition);
	}

	useLayoutEffect(() => {
		if (typeTransition?.phase !== "preparing") return;
		if (typeTransitionRef.current?.id !== typeTransition.id) return;
		const animating = animateTypeTransition(typeTransition);
		typeTransitionRef.current = animating;
		applyTypeSwitch(animating.to);
		setTypeTransition(animating);
	}, [typeTransition?.id, typeTransition?.phase]);

	useLayoutEffect(() => {
		if (typeTransition?.phase !== "animating") return;
		typeVisualPosition.set(
			withTiming(TRANSACTION_TYPE_INDEX[typeTransition.to], {
				duration: motion.tab,
				easing: Easing.out(Easing.cubic),
			}),
		);
	}, [
		typeTransition?.id,
		typeTransition?.phase,
		typeTransition?.to,
		typeVisualPosition,
	]);

	function handleKey(key: string) {
		setAmountText((previous) => {
			const next = applyCalcInput(
				previous,
				key,
				replaceAmountOnNextNumericRef.current,
			);
			replaceAmountOnNextNumericRef.current = next.replaceOnNextNumeric;
			return next.expression;
		});
	}

	function applyAmountResult(amountCents: number, nextCurrency: string) {
		setCurrency(nextCurrency);
		setAmountText(formatCents(amountCents, { grouping: false }));
		if (amountCents < 0) {
			promptSwitchOnNegative({
				cents: amountCents,
				type,
				onSwitch: switchType,
				onAbsAmountText: setAmountText,
			});
		}
	}

	// 完成：求值折叠为结果（非空时），再收起键盘。空 / 10÷0 等仅收起，不丢数据。
	function handleDone() {
		const r = evalMoneyExpr(amountText);
		setKeypadVisible(false);
		if (r !== null) applyAmountResult(r, currency);
	}

	async function openAmountKeypad() {
		Keyboard.dismiss();
		if (Platform.OS !== "android" || !isQuickKeypadAvailable()) {
			replaceAmountOnNextNumericRef.current = amountText !== "";
			setKeypadVisible(true);
			return;
		}

		try {
			const result = await openKeypad({
				initialAmountCents: evalMoneyExpr(amountText) ?? 0,
				initialCurrency: currency,
			});
			nativeKeypadClosedAtRef.current = Date.now();
			if (result) applyAmountResult(result.amountCents, result.currency);
		} catch {
			replaceAmountOnNextNumericRef.current = amountText !== "";
			setKeypadVisible(true);
		}
	}

	function showValidationError(error: TransactionValidationError): void {
		const message = {
			invalidAmount: zh.txList.invalidAmount,
			needAccount: zh.txList.needAccount,
			needCategory: zh.txList.needCategory,
			sameAccount: zh.txList.sameAccount,
			invalidFee: zh.txList.invalidFee,
			invalidDate: zh.txList.invalidDate,
		}[error];
		Alert.alert(message);
	}

	function handleSave() {
		// Swallow the stray second tap that lands on 保存 right after the native keypad's
		// OK closes on top of it (see nativeKeypadClosedAtRef).
		if (Date.now() - nativeKeypadClosedAtRef.current < 600) return;
		if (!inputResult.input) {
			showValidationError(inputResult.error);
			return;
		}
		void onSubmit(inputResult.input);
	}

	useImperativeHandle(
		ref,
		() => ({
			prepareDismiss: async () => {
				closeOverlaysIfAny();
				return true;
			},
			closeOverlaysIfAny,
			save: async () => {
				if (closeOverlaysIfAny()) return false;
				if (!inputResult.input) {
					showValidationError(inputResult.error);
					return false;
				}
				try {
					await onSubmit(inputResult.input);
					return true;
				} catch {
					return false;
				}
			},
		}),
		[closeOverlaysIfAny, inputResult, onSubmit],
	);

	function renderCategoryCell(node: CategoryNode) {
		const selectedChild = node.children.find(
			(child) => child.id === categoryId,
		);
		const selected = categoryId === node.id || selectedChild !== undefined;
		const visualCategory = selectedChild ?? node;
		const hasChildren = node.children.length > 0;
		return (
			<Pressable
				key={node.id}
				style={[
					styles.categoryChip,
					selected && { backgroundColor: typeColor, borderColor: typeColor },
				]}
				onPress={() => {
					setCategoryTouched(true);
					// 该父分类下已选中子分类时，点击胶囊本体保持子分类，不回退到父分类。
					// 想切回父分类请用「全部分类」弹窗。
					if (!selectedChild) setCategoryId(node.id);
				}}
			>
				<Icon
					name={resolveIconKey(visualCategory.icon, "category")}
					size={14}
					color={selected ? colors.onPrimary : colors.text}
				/>
				<Text
					style={[
						styles.categoryChipName,
						{ color: selected ? colors.onPrimary : colors.text },
					]}
					numberOfLines={1}
				>
					{visualCategory.name}
				</Text>
				{hasChildren && (
					<Pressable
						ref={(r) => {
							badgeRefs.current[node.id] = r;
						}}
						style={styles.categoryMoreBtn}
						hitSlop={6}
						onPress={(e) => {
							e.stopPropagation();
							badgeRefs.current[node.id]?.measureInWindow((x, y, _w, h) => {
								setSubmenu({ node, x, y: y + h });
							});
						}}
					>
						<Icon
							name="chevron-down"
							size={14}
							color={selected ? colors.onPrimary : colors.textSecondary}
						/>
					</Pressable>
				)}
			</Pressable>
		);
	}

	// Make the current page absolute before changing the key so both native pages can coexist.
	// originX also lets an interrupted page exit from its current on-screen position.
	const typeSlideDistance = typePageWidthRef.current;
	const typeSlideDirection = typeTransition?.direction ?? 1;
	const typeTransitionId = typeTransition?.id ?? 0;
	const isOutgoingTypePage =
		typeTransition !== null && type !== typeTransition.to;
	const contentEntering = useMemo<EntryExitAnimationFunction>(() => {
		return (values: EntryAnimationsValues) => {
			"worklet";
			return {
				initialValues: {
					originX:
						values.targetOriginX + typeSlideDirection * typeSlideDistance,
				},
				animations: {
					originX: withTiming(values.targetOriginX, {
						duration: motion.tab,
						easing: Easing.out(Easing.cubic),
					}),
				},
				callback: (finished: boolean) => {
					if (finished)
						scheduleOnRN(completeTypeTransition, typeTransitionId);
				},
			};
		};
	}, [
		completeTypeTransition,
		typeSlideDirection,
		typeSlideDistance,
		typeTransitionId,
	]);
	const contentExiting = useMemo<EntryExitAnimationFunction>(() => {
		return (values: ExitAnimationsValues) => {
			"worklet";
			return {
				initialValues: { originX: values.currentOriginX },
				animations: {
					originX: withTiming(
						values.currentOriginX -
							typeSlideDirection * typeSlideDistance,
						{
							duration: motion.tab,
							easing: Easing.out(Easing.cubic),
						},
					),
				},
			};
		};
	}, [typeSlideDirection, typeSlideDistance]);
	const saveButtonColorStyle = useAnimatedStyle(() => ({
		backgroundColor: interpolateColor(
			typeVisualPosition.get(),
			[0, 1, 2],
			[colors.expense, colors.income, colors.transfer],
		),
	}), [
		colors.expense,
		colors.income,
		colors.transfer,
		typeVisualPosition,
	]);

	// Progressive blocks fade without moving so later stages do not shift earlier content.
	// Full editor mode mounts every block together and therefore skips this animation.
	const revealEntering =
		renderMode === "staged-editor"
			? FadeIn.duration(motion.base).easing(Easing.out(Easing.cubic))
			: undefined;
	// Once the type changes, the keyed page shell owns the transition.
	const blockEntering = typeSwitchedRef.current ? undefined : revealEntering;

	if (editorStage === 0) {
		const summaryAmount = evalMoneyExpr(amountText);
		const secondaryLabel =
			type === "transfer" ? zh.tx.toAccount : zh.tx.category;
		const secondaryValue =
			type === "transfer"
				? (selectedDestinationAccount?.name ?? summaryValues?.toAccountName)
				: (selectedCategory?.name ?? summaryValues?.categoryName);

		return (
			<View
				testID="transaction-editor-summary"
				pointerEvents="none"
				accessibilityLabel={`${typeLabel}, ${amountText}`}
				style={[styles.summaryRoot, { backgroundColor: colors.background }]}
			>
				<View
					style={[
						styles.summaryTypePill,
						{ backgroundColor: `${typeColor}22` },
					]}
				>
					<Text style={[styles.summaryTypeText, { color: typeColor }]}>
						{typeLabel}
					</Text>
				</View>
				<View
					style={[styles.summaryAmountCard, { backgroundColor: colors.card }]}
				>
					<Text selectable style={[styles.summaryAmount, { color: typeColor }]}>
						{currencySymbol(currency)}
						{summaryAmount !== null
							? formatCents(Math.abs(summaryAmount))
							: amountText || "0.00"}
					</Text>
				</View>
				<View style={styles.summaryDetails}>
					<View
						style={[styles.summaryDetail, { backgroundColor: colors.card }]}
					>
						<Icon
							name={resolveIconKey(selectedAccount?.icon, "account")}
							size={20}
							color={typeColor}
						/>
						<View style={styles.summaryDetailText}>
							<Text
								style={[styles.summaryLabel, { color: colors.textSecondary }]}
							>
								{type === "transfer" ? zh.tx.fromAccount : zh.tx.account}
							</Text>
							<Text
								numberOfLines={1}
								style={[styles.summaryValue, { color: colors.text }]}
							>
								{selectedAccount?.name ??
									summaryValues?.accountName ??
									zh.common.loading}
							</Text>
						</View>
					</View>
					<View
						style={[styles.summaryDetail, { backgroundColor: colors.card }]}
					>
						<Icon
							name={
								type === "transfer"
									? resolveIconKey(selectedDestinationAccount?.icon, "account")
									: resolveIconKey(
											selectedCategory?.icon ?? summaryValues?.categoryIcon,
											"category",
										)
							}
							size={20}
							color={
								selectedCategory?.color ??
								summaryValues?.categoryColor ??
								typeColor
							}
						/>
						<View style={styles.summaryDetailText}>
							<Text
								style={[styles.summaryLabel, { color: colors.textSecondary }]}
							>
								{secondaryLabel}
							</Text>
							<Text
								numberOfLines={1}
								style={[styles.summaryValue, { color: colors.text }]}
							>
								{secondaryValue ?? zh.common.loading}
							</Text>
						</View>
					</View>
					{type === "transfer" && (
						<View
							style={[
								styles.summaryDetail,
								styles.summaryDetailWide,
								{ backgroundColor: colors.card },
							]}
						>
							<Icon
								name={resolveIconKey(
									selectedCategory?.icon ?? summaryValues?.categoryIcon,
									"category",
								)}
								size={20}
								color={
									selectedCategory?.color ??
									summaryValues?.categoryColor ??
									typeColor
								}
							/>
							<View style={styles.summaryDetailText}>
								<Text
									style={[styles.summaryLabel, { color: colors.textSecondary }]}
								>
									{zh.tx.transferCategory}
								</Text>
								<Text
									numberOfLines={1}
									style={[styles.summaryValue, { color: colors.text }]}
								>
									{selectedCategory?.name ??
										summaryValues?.categoryName ??
										zh.common.loading}
								</Text>
							</View>
						</View>
					)}
				</View>
				<DateTimeSemanticCards
					dateText={dateText}
					timeText={timeText}
					onPressDate={() => {}}
					onPressTime={() => {}}
				/>
			</View>
		);
	}

	return (
		<View
			style={{ flex: 1, backgroundColor: colors.background }}
			onLayout={onInteractive ? () => setFormLaidOut(true) : undefined}
		>
			{/* sheet 是 absolute+translateY 浮层，KeyboardAvoidingView 在 Android 上对其失效，
			   故 Android 关闭 KAV，改由 keyboardDidShow 时手动 scrollTo + saveFooter 上移避让。 */}
			<KeyboardAvoidingView
				style={{ flex: 1 }}
				behavior={Platform.OS === "ios" ? "padding" : undefined}
			>
				<ScrollView
					ref={scrollRef}
					removeClippedSubviews={Platform.OS === "android"}
					style={{ flex: 1 }}
					contentContainerStyle={{
						padding: 16,
						// 键盘弹出时追加底部内边距，给 ScrollView 足够滚动空间让备注避开键盘
						paddingBottom: 16 + (keyboardVisible ? keyboardHeight : 0),
					}}
					keyboardShouldPersistTaps="handled"
					onScroll={(e) => {
						scrollYRef.current = e.nativeEvent.contentOffset.y;
					}}
					scrollEventThrottle={16}
				>
					<TransactionTypeSegment
						type={type}
						visualPosition={typeVisualPosition}
						onSelect={switchType}
					/>

					<View
						testID="transaction-type-page-viewport"
						style={[
							styles.typePageViewport,
							typeTransition && { minHeight: typeTransition.minHeight },
						]}
					>
						<Animated.View
							key={type}
							collapsable={false}
							testID={`transaction-type-page-${type}`}
							entering={
								typeTransition?.phase === "animating"
									? contentEntering
									: undefined
							}
							exiting={typeTransition ? contentExiting : undefined}
							onLayout={handleTypePageLayout}
							pointerEvents={isOutgoingTypePage ? "none" : "auto"}
							accessibilityElementsHidden={isOutgoingTypePage}
							importantForAccessibility={
								isOutgoingTypePage ? "no-hide-descendants" : "auto"
							}
							style={typeTransition ? styles.typePageAbsolute : undefined}
						>
						{/* 金额 */}
						<View style={styles.amountBox}>
							<Pressable
								style={styles.currencySymbolBtn}
								hitSlop={8}
								onPress={() => {
									Keyboard.dismiss();
									setCurrencyPickerOpen(true);
								}}
							>
								<Text style={[styles.currencySymbol, { color: typeColor }]}>
									{currencySymbol(currency)}
								</Text>
							</Pressable>
							<Pressable
								style={{ flex: 1 }}
								onPress={() => void openAmountKeypad()}
							>
								<Text
									style={[
										styles.amountInput,
										{ color: amountText ? typeColor : colors.border },
									]}
								>
									{amountText || zh.txList.amountPlaceholder}
								</Text>
							</Pressable>
							{preview !== null && (
								<Text style={[styles.preview, { color: colors.textSecondary }]}>
									= {formatCents(preview, { grouping: false })}
								</Text>
							)}
							{preview === null && basePreview !== null && (
								<Text style={[styles.preview, { color: colors.textSecondary }]}>
									≈ {formatCentsWithSymbol(basePreview, "CNY")}
								</Text>
							)}
						</View>

						{/* 分类 */}
						{editorStage >= 2 && (
							<Animated.View style={styles.card} entering={blockEntering}>
								<Text style={styles.sectionLabel}>
									{type === "transfer" ? zh.tx.transferCategory : zh.tx.category}
								</Text>
								<View style={styles.categoryGrid}>
									{visibleTree.map(renderCategoryCell)}
								</View>
								{editorStage >= categoryAllStage &&
									categoryTree.length > mountedCategoryCount && (
										<Pressable
											style={[styles.allBtn, { borderColor: colors.border }]}
											onPress={() => setCategoryPickerOpen(true)}
										>
											<Icon
												name="search"
												size={16}
												color={colors.textSecondary}
											/>
											<Text
												style={[
													styles.allBtnText,
													{ color: colors.textSecondary },
												]}
											>
												{zh.tx.categoryAll}
											</Text>
											<Icon
												name="chevron-right"
												size={16}
												color={colors.textSecondary}
											/>
										</Pressable>
									)}
							</Animated.View>
						)}

						{/* 账户 */}
						{mountedAccountCount > 0 && (
							<Animated.View style={styles.card} entering={blockEntering}>
								<Text style={styles.sectionLabel}>
									{type === "transfer" ? zh.tx.fromAccount : zh.tx.account}
								</Text>
								<ScrollView horizontal showsHorizontalScrollIndicator={false}>
									<View style={styles.chipRow}>
										{orderedAccounts.slice(0, mountedAccountCount).map((a) => {
											const selected = effectiveAccountId === a.id;
											return (
												<Pressable
													key={a.id}
													style={[
														styles.chip,
														selected && {
															backgroundColor: colors.primary,
															borderColor: colors.primary,
														},
													]}
													onPress={() => {
														setAccountTouched(true);
														setAccountId(a.id);
														if (toAccountId === a.id) setToAccountId(null);
													}}
												>
													<View
														style={{
															flexDirection: "row",
															alignItems: "center",
															gap: 4,
														}}
													>
														<Icon
															name={resolveIconKey(a.icon, "account")}
															size={14}
															color={selected ? colors.onPrimary : colors.text}
														/>
														<Text
															style={{
																color: selected
																	? colors.onPrimary
																	: colors.text,
																fontSize: 13,
															}}
														>
															{a.name}
														</Text>
													</View>
												</Pressable>
											);
										})}
									</View>
								</ScrollView>
							</Animated.View>
						)}

						{/* 转账：转入账户 + 手续费 */}
						{mountedDestinationAccountCount > 0 && type === "transfer" && (
							<Animated.View entering={blockEntering}>
								<View style={styles.card}>
									<Text style={styles.sectionLabel}>{zh.tx.toAccount}</Text>
									<ScrollView horizontal showsHorizontalScrollIndicator={false}>
										<View style={styles.chipRow}>
											{orderedDestinationAccounts
												.slice(0, mountedDestinationAccountCount)
												.map((a) => {
													const selected = toAccountId === a.id;
													return (
														<Pressable
															key={a.id}
															style={[
																styles.chip,
																selected && {
																	backgroundColor: colors.transfer,
																	borderColor: colors.transfer,
																},
															]}
															onPress={() => {
																setAccountTouched(true);
																setToAccountId(a.id);
															}}
														>
															<View
																style={{
																	flexDirection: "row",
																	alignItems: "center",
																	gap: 4,
																}}
															>
																<Icon
																	name={resolveIconKey(a.icon, "account")}
																	size={14}
																	color={
																		selected ? colors.onPrimary : colors.text
																	}
																/>
																<Text
																	style={{
																		color: selected
																			? colors.onPrimary
																			: colors.text,
																		fontSize: 13,
																	}}
																>
																	{a.name}
																</Text>
															</View>
														</Pressable>
													);
												})}
										</View>
									</ScrollView>
								</View>
								{editorStage >= 11 && (
									<View style={styles.card}>
										<Text style={styles.sectionLabel}>{zh.tx.fee}</Text>
										<SingleLineTextInput
											ref={feeInputRef}
											style={styles.textInput}
											value={feeText}
											onChangeText={setFeeText}
											placeholder={zh.txList.feePlaceholder}
											placeholderTextColor={colors.textSecondary}
											keyboardType="decimal-pad"
											onFocus={() => {
												setKeypadVisible(false);
												activeInputRef.current = feeInputRef.current;
											}}
										/>
									</View>
								)}
							</Animated.View>
						)}

						{editorStage >= dateStage && (
							<Animated.View entering={blockEntering}>
								<DateTimeSemanticCards
									dateText={dateText}
									timeText={timeText}
									onPressDate={() => {
										setTempDate(dayjs(dateText, "YYYY-MM-DD").toDate());
										setDatePickerOpen(true);
									}}
									onPressTime={() => {
										setTempTime(dayjs(`${dateText} ${timeText}`).toDate());
										setTimePickerOpen(true);
									}}
								/>
							</Animated.View>
						)}

						{/* 备注 */}
						{editorStage >= noteStage && (
							<Animated.View style={styles.card} entering={blockEntering}>
								<Text style={styles.sectionLabel}>{zh.tx.note}</Text>
								<SingleLineTextInput
									ref={noteInputRef}
									style={styles.textInput}
									value={note}
									onChangeText={setNote}
									placeholder={zh.tx.notePlaceholder}
									placeholderTextColor={colors.textSecondary}
									onFocus={() => {
										setKeypadVisible(false);
										activeInputRef.current = noteInputRef.current;
									}}
								/>
							</Animated.View>
						)}

						{/* 项目（可选，适用于所有交易类型） */}
						{editorStage >= projectStage && (
							<Animated.View style={styles.card} entering={blockEntering}>
								<Text style={styles.sectionLabel}>{zh.tx.project}</Text>
								<ScrollView horizontal showsHorizontalScrollIndicator={false}>
									<View style={styles.chipRow}>
										<Pressable
											style={[
												styles.chip,
												projectId === null && {
													backgroundColor: colors.primary,
													borderColor: colors.primary,
												},
											]}
											onPress={() => setProjectId(null)}
										>
											<Text
												style={{
													color:
														projectId === null
															? colors.onPrimary
															: colors.textSecondary,
													fontSize: 13,
												}}
											>
												{zh.tx.projectNone}
											</Text>
										</Pressable>
										{projects.map((p) => {
											const selected = projectId === p.id;
											return (
												<Pressable
													key={p.id}
													style={[
														styles.chip,
														selected && {
															backgroundColor: colors.primary,
															borderColor: colors.primary,
														},
													]}
													onPress={() => setProjectId(p.id)}
												>
													<View
														style={{
															flexDirection: "row",
															alignItems: "center",
															gap: 4,
														}}
													>
														<Icon
															name={resolveIconKey(p.icon, "category")}
															size={14}
															color={selected ? colors.onPrimary : colors.text}
														/>
														<Text
															style={{
																color: selected
																	? colors.onPrimary
																	: colors.text,
																fontSize: 13,
															}}
														>
															{p.name}
														</Text>
													</View>
												</Pressable>
											);
										})}
									</View>
								</ScrollView>
							</Animated.View>
						)}
						</Animated.View>
					</View>
				</ScrollView>

				{editorStage >= saveStage && mode === "create" && (
					<Animated.View
						entering={blockEntering}
						style={[
							styles.saveFooter,
							saveFooterAnimatedStyle,
							{
								backgroundColor: colors.card,
								borderTopColor: colors.border,
								paddingBottom: insets.bottom + 8,
							},
						]}
					>
						<AnimatedPressable
							style={[
								styles.saveBtn,
								saveButtonColorStyle,
								{
									opacity:
										submitting || !canSave || typeTransition ? 0.6 : 1,
								},
							]}
							onPress={handleSave}
							disabled={submitting || !canSave || typeTransition !== null}
						>
							<Text style={[styles.saveBtnText, { color: colors.onPrimary }]}>
								{zh.common.save}
							</Text>
						</AnimatedPressable>
					</Animated.View>
				)}
				{keypadVisible && (
					<Animated.View
						entering={FadeIn.duration(motion.fast)}
						exiting={FadeOut.duration(motion.fast)}
						style={[
							StyleSheet.absoluteFill,
							{ backgroundColor: "rgba(0,0,0,0.25)" },
						]}
						onStartShouldSetResponder={() => {
							setKeypadVisible(false);
							return true;
						}}
					/>
				)}
			</KeyboardAvoidingView>
			{keypadVisible && (
				<Animated.View
					entering={SlideInDown.duration(motion.enter)}
					exiting={SlideOutDown.duration(motion.exit)}
				>
					<AmountKeypadPanel
						amountText={amountText}
						currency={currency}
						accentColor={typeColor}
						onKey={handleKey}
						onDone={handleDone}
						onPressCurrency={() => {
							Keyboard.dismiss();
							setCurrencyPickerOpen(true);
						}}
					/>
				</Animated.View>
			)}

			{/* 日期选择器：Android 系统对话框 / iOS 底部滚轮面板（display=spinner） */}
			{datePickerOpen && Platform.OS === "android" && (
				<DateTimePicker
					value={tempDate}
					mode="date"
					display="spinner"
					onValueChange={(_event, selected) => {
						setDatePickerOpen(false);
						setDateText(dayjs(selected).format("YYYY-MM-DD"));
					}}
					onDismiss={() => setDatePickerOpen(false)}
				/>
			)}
			{datePickerOpen && Platform.OS === "ios" && (
				<Modal
					transparent
					animationType="fade"
					onRequestClose={() => setDatePickerOpen(false)}
				>
					<Pressable
						style={styles.pickerMask}
						onPress={() => setDatePickerOpen(false)}
					>
						{/* 遮罩 fade + 面板上滑分离（业界底部弹层规范） */}
						<AnimatedPressable
							entering={SlideInDown.duration(motion.enter)}
							style={[
								styles.pickerSheet,
								{
									backgroundColor: colors.card,
									paddingBottom: insets.bottom + 8,
								},
							]}
							onPress={() => {}}
						>
							<View style={styles.pickerHeader}>
								<Pressable
									onPress={() => {
										setDateText(dayjs(tempDate).format("YYYY-MM-DD"));
										setDatePickerOpen(false);
									}}
								>
									<Text
										style={{
											color: colors.primary,
											fontSize: 16,
											fontWeight: "600",
										}}
									>
										{zh.common.done}
									</Text>
								</Pressable>
							</View>
							<DateTimePicker
								value={tempDate}
								mode="date"
								display="spinner"
								onValueChange={(_event, selected) => {
									setTempDate(selected);
								}}
							/>
						</AnimatedPressable>
					</Pressable>
				</Modal>
			)}

			{/* 时间选择器：Android 系统对话框 / iOS 底部滚轮面板（display=spinner） */}
			{timePickerOpen && Platform.OS === "android" && (
				<DateTimePicker
					value={tempTime}
					mode="time"
					display="spinner"
					onValueChange={(_event, selected) => {
						setTimePickerOpen(false);
						if (selected) setTimeText(dayjs(selected).format("HH:mm"));
					}}
					onDismiss={() => setTimePickerOpen(false)}
				/>
			)}
			{timePickerOpen && Platform.OS === "ios" && (
				<Modal
					transparent
					animationType="fade"
					onRequestClose={() => setTimePickerOpen(false)}
				>
					<Pressable
						style={styles.pickerMask}
						onPress={() => setTimePickerOpen(false)}
					>
						{/* 遮罩 fade + 面板上滑分离（业界底部弹层规范） */}
						<AnimatedPressable
							entering={SlideInDown.duration(motion.enter)}
							style={[
								styles.pickerSheet,
								{
									backgroundColor: colors.card,
									paddingBottom: insets.bottom + 8,
								},
							]}
							onPress={() => {}}
						>
							<View style={styles.pickerHeader}>
								<Pressable
									onPress={() => {
										setTimeText(dayjs(tempTime).format("HH:mm"));
										setTimePickerOpen(false);
									}}
								>
									<Text
										style={{
											color: colors.primary,
											fontSize: 16,
											fontWeight: "600",
										}}
									>
										{zh.common.done}
									</Text>
								</Pressable>
							</View>
							<DateTimePicker
								value={tempTime}
								mode="time"
								display="spinner"
								onValueChange={(_event, selected) => {
									setTempTime(selected);
								}}
							/>
						</AnimatedPressable>
					</Pressable>
				</Modal>
			)}

			{/* 币种选择器 */}
			<CurrencyPickerModal
				visible={currencyPickerOpen}
				selected={currency}
				accentColor={typeColor}
				onSelect={setCurrency}
				onClose={() => setCurrencyPickerOpen(false)}
			/>

			{/* 全部分类弹窗 */}
			<CategoryPickerModal
				visible={categoryPickerOpen}
				tree={categoryTree}
				categoryType={categoryType}
				selectedId={categoryId}
				onSelect={(id) => {
					setCategoryTouched(true);
					setCategoryId(id);
				}}
				onClose={() => setCategoryPickerOpen(false)}
			/>

			{/* 子分类下拉菜单（按「更多」徽标定位） */}
			{submenu && (
				<Modal
					transparent
					animationType="fade"
					onRequestClose={() => setSubmenu(null)}
				>
					<Pressable
						style={styles.submenuMask}
						onPress={() => setSubmenu(null)}
					>
						<Pressable
							style={[
								styles.submenuCard,
								{
									backgroundColor: colors.card,
									borderColor: colors.border,
									left: Math.min(
										submenu.x,
										Dimensions.get("window").width - 184,
									),
									top: Math.min(
										submenu.y,
										Dimensions.get("window").height - 320,
									),
								},
							]}
							onPress={(e) => e.stopPropagation()}
						>
							<Text
								style={[styles.submenuTitle, { color: colors.textSecondary }]}
							>
								{submenu.node.name}
							</Text>
							{submenu.node.children.map((child) => {
								const sel = child.id === categoryId;
								return (
									<Pressable
										key={child.id}
										style={[
											styles.submenuRow,
											sel && { backgroundColor: `${typeColor}18` },
										]}
										onPress={() => {
											setCategoryTouched(true);
											setCategoryId(child.id);
											setSubmenu(null);
										}}
									>
										<Icon
											name={resolveIconKey(child.icon, "category")}
											size={16}
											color={child.color ?? colors.primary}
										/>
										<Text
											style={[styles.submenuRowText, { color: colors.text }]}
										>
											{child.name}
										</Text>
										{sel && <Icon name="check" size={16} color={typeColor} />}
									</Pressable>
								);
							})}
						</Pressable>
					</Pressable>
				</Modal>
			)}
		</View>
	);
}

export const TransactionForm = forwardRef<TransactionFormHandle, Props>(
	TransactionFormComponent,
);

function makeStyles({ colors }: AppTheme) {
	return StyleSheet.create({
		summaryRoot: {
			flex: 1,
			padding: 16,
			gap: 12,
		},
		summaryTypePill: {
			alignSelf: "flex-start",
			borderRadius: 999,
			paddingHorizontal: 12,
			paddingVertical: 6,
		},
		summaryTypeText: { fontSize: 14, fontWeight: "600" },
		summaryAmountCard: {
			borderRadius: 14,
			paddingHorizontal: 16,
			paddingVertical: 18,
		},
		summaryAmount: {
			fontSize: 36,
			fontWeight: "700",
			fontVariant: ["tabular-nums"],
		},
		summaryDetails: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
		summaryDetail: {
			flex: 1,
			minWidth: 0,
			flexDirection: "row",
			alignItems: "center",
			gap: 8,
			borderRadius: 12,
			padding: 12,
		},
		summaryDetailWide: { flexBasis: "100%" },
		summaryDetailText: { flex: 1, minWidth: 0 },
		summaryLabel: { fontSize: 12, marginBottom: 2 },
		summaryValue: { fontSize: 14, fontWeight: "600" },
		typePageViewport: {
			position: "relative",
			overflow: "hidden",
		},
		typePageAbsolute: {
			position: "absolute",
			top: 0,
			right: 0,
			left: 0,
		},
		amountBox: {
			flexDirection: "row",
			alignItems: "center",
			backgroundColor: colors.card,
			borderRadius: 12,
			paddingHorizontal: 16,
			marginBottom: 12,
		},
		currencySymbol: { fontSize: 28, fontWeight: "600" },
		currencySymbolBtn: { marginRight: 8, paddingVertical: 4 },
		amountInput: {
			flex: 1,
			fontSize: 36,
			fontWeight: "700",
			paddingVertical: 14,
		},
		preview: { fontSize: 16, fontWeight: "500", flexShrink: 1 },
		card: {
			backgroundColor: colors.card,
			borderRadius: 12,
			padding: 12,
			marginBottom: 12,
		},
		sectionLabel: {
			color: colors.textSecondary,
			fontSize: 13,
			marginBottom: 8,
		},
		categoryGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
		categoryChip: {
			flexDirection: "row",
			alignItems: "center",
			gap: 4,
			paddingHorizontal: 12,
			paddingVertical: 7,
			borderRadius: 16,
			borderWidth: 1,
			borderColor: colors.border,
		},
		categoryChipName: { fontSize: 13 },
		categoryMoreBtn: { marginLeft: 2, padding: 2 },
		allBtn: {
			flexDirection: "row",
			alignItems: "center",
			justifyContent: "center",
			gap: 6,
			marginTop: 8,
			paddingTop: 8,
			borderTopWidth: StyleSheet.hairlineWidth,
			borderColor: colors.border,
		},
		allBtnText: { fontSize: 13, fontWeight: "500" },
		submenuMask: { flex: 1, backgroundColor: "rgba(0,0,0,0.25)" },
		submenuCard: {
			position: "absolute",
			width: 180,
			borderRadius: 10,
			borderWidth: 1,
			padding: 6,
			elevation: 6,
			shadowColor: "#000",
			shadowOpacity: 0.2,
			shadowRadius: 8,
			shadowOffset: { width: 0, height: 3 },
		},
		submenuTitle: {
			fontSize: 12,
			paddingHorizontal: 8,
			paddingTop: 4,
			paddingBottom: 6,
		},
		submenuRow: {
			flexDirection: "row",
			alignItems: "center",
			gap: 8,
			paddingVertical: 8,
			paddingHorizontal: 8,
			borderRadius: 8,
		},
		submenuRowText: { flex: 1, fontSize: 14 },
		chipRow: { flexDirection: "row", gap: 8 },
		chip: {
			paddingHorizontal: 12,
			paddingVertical: 7,
			borderRadius: 16,
			borderWidth: 1,
			borderColor: colors.border,
			marginBottom: 4,
		},
		textInput: {
			height: 40,
			color: colors.text,
			fontSize: 15,
			paddingHorizontal: 10,
			borderWidth: 1,
			borderColor: colors.border,
			borderRadius: 8,
		},
		saveFooter: {
			paddingTop: 8,
			paddingHorizontal: 16,
			borderTopWidth: StyleSheet.hairlineWidth,
		},
		saveBtn: {
			borderRadius: 12,
			paddingVertical: 14,
			alignItems: "center",
		},
		saveBtnText: { fontSize: 16, fontWeight: "600" },
		pickerMask: {
			flex: 1,
			backgroundColor: "rgba(0,0,0,0.4)",
			justifyContent: "flex-end",
		},
		pickerSheet: { borderTopLeftRadius: 14, borderTopRightRadius: 14 },
		pickerHeader: {
			flexDirection: "row",
			justifyContent: "flex-end",
			padding: 12,
		},
	});
}
