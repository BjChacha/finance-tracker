import { useEffect, useRef, useState } from "react";
import {
	Keyboard,
	Modal,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	View,
	useWindowDimensions,
} from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/components/Icon";
import { SingleLineTextInput } from "@/components/single-line-text-input";
import type { CategoryType } from "@/db/schema";
import { useCreateCategory, type CategoryNode } from "@/features/categories";
import { zh } from "@/i18n/zh";
import { matchText } from "@/lib/fuzzy";
import { resolveIconKey } from "@/lib/iconResolvers";
import { motion, useTheme } from "@/theme";

/** 快速创建分类的默认色（与分类编辑器新建默认一致） */
const DEFAULT_CATEGORY_COLOR = "#F97316";

type Props = {
	visible: boolean;
	tree: CategoryNode[];
	categoryType: CategoryType;
	selectedId: string | null;
	onSelect: (id: string) => void;
	onClose: () => void;
};

/**
 * 「全部分类」弹窗：胶囊（chip）呈现，样式与编辑交易表单/预算编辑器一致。
 * 默认只显示主分类——点击胶囊选中主分类（该父分类下已选子分类时保持子分类）；
 * 主分类有子分类时胶囊尾部显示下拉箭头，点击弹出子分类菜单。
 * 输入搜索词后改为扁平匹配所有父子分类（快速定位）。
 * 键盘弹出时 sheet 上移避让，收起时贴底呈现完整卡片（下方无透明间隙）。
 */
export function CategoryPickerModal({
	visible,
	tree,
	categoryType,
	selectedId,
	onSelect,
	onClose,
}: Props) {
	const theme = useTheme();
	const { colors } = theme;
	const typeColor =
		categoryType === "income"
			? colors.income
			: categoryType === "transfer"
				? colors.transfer
				: colors.expense;
	const insets = useSafeAreaInsets();
	const { width: screenW, height: screenH } = useWindowDimensions();
	const [query, setQuery] = useState("");
	const [kbHeight, setKbHeight] = useState(0);
	const [submenu, setSubmenu] = useState<{
		parent: CategoryNode;
		x: number;
		y: number;
	} | null>(null);
	const badgeRefs = useRef<Record<string, View | null>>({});

	useEffect(() => {
		if (!visible) {
			setKbHeight(0);
			setSubmenu(null);
			return;
		}
		const show = Keyboard.addListener("keyboardDidShow", (e) =>
			setKbHeight(e.endCoordinates.height),
		);
		const hide = Keyboard.addListener("keyboardDidHide", () => setKbHeight(0));
		return () => {
			show.remove();
			hide.remove();
		};
	}, [visible]);

	const createCat = useCreateCategory();

	if (!visible) return null;

	const q = query.trim();
	const showFlat = q !== "";

	// 扁平列表仅用于搜索匹配（默认视图只渲染主分类 tree）
	const rows: {
		id: string;
		name: string;
		icon: string | null;
		color: string | null;
		path: string;
	}[] = [];
	for (const p of tree) {
		rows.push({
			id: p.id,
			name: p.name,
			icon: p.icon,
			color: p.color,
			path: p.name,
		});
		for (const c of p.children) {
			rows.push({
				id: c.id,
				name: c.name,
				icon: c.icon,
				color: c.color,
				path: `${p.name} › ${c.name}`,
			});
		}
	}
	const filtered = showFlat
		? rows.filter((r) => matchText(q, r.path) || matchText(q, r.name))
		: [];
	const exactExists =
		showFlat && rows.some((r) => r.name.toLowerCase() === q.toLowerCase());
	const canCreate = showFlat && !exactExists;

	function close() {
		Keyboard.dismiss();
		setQuery("");
		setSubmenu(null);
		onClose();
	}
	function handlePick(id: string) {
		onSelect(id);
		close();
	}
	async function handleCreate() {
		if (!q) return;
		try {
			const newId = await createCat.mutateAsync({
				name: q,
				type: categoryType,
				icon: "package",
				color: categoryType === "transfer" ? typeColor : DEFAULT_CATEGORY_COLOR,
				parentId: null,
			});
			onSelect(newId);
			close();
		} catch {
			/* 创建失败保留弹窗，用户可重试 */
		}
	}

	// 列表区随内容自适应、最高不超过 42% 屏高；键盘避让由 sheet 上移 + 底部填充处理。
	const gridMaxHeight = Math.round(screenH * 0.42);

	function renderParentChip(node: CategoryNode) {
		// 选中态：本主分类被选，或其下某个子分类被选（高亮提示所属）。
		// 弹窗是浏览/选择器：胶囊始终显示父分类名，点击即选父分类——
		// 表单里“已选子分类时点胶囊保持子分类”的语义不适用于此，
		// 否则子分类选中后父分类将无处可选。
		const selected =
			selectedId === node.id || node.children.some((c) => c.id === selectedId);
		const hasChildren = node.children.length > 0;
		return (
			<Pressable
				key={node.id}
				style={[
					styles.chip,
					{ borderColor: selected ? typeColor : colors.border },
					selected && { backgroundColor: typeColor },
				]}
				onPress={() => handlePick(node.id)}
			>
				<Icon
					name={resolveIconKey(node.icon, "category")}
					size={14}
					color={selected ? colors.onPrimary : colors.text}
				/>
				<Text
					style={{
						color: selected ? colors.onPrimary : colors.text,
						fontSize: 13,
					}}
					numberOfLines={1}
				>
					{node.name}
				</Text>
				{hasChildren && (
					<Pressable
						ref={(r) => {
							badgeRefs.current[node.id] = r;
						}}
						style={styles.chipMoreBtn}
						hitSlop={6}
						onPress={(e) => {
							e.stopPropagation();
							badgeRefs.current[node.id]?.measureInWindow((x, y, _w, h) => {
								setSubmenu({ parent: node, x, y: y + h });
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

	// 键盘避让偏移：仅真实软键盘（高度 > 400）触发。输入法工具条/悬浮条等小高度事件
	// 会派发 keyboardDidShow 但不一定派发 keyboardDidHide，导致 kbHeight 残留（实测
	// 113~293px），使 sheet 离底悬空露出透明间隙，故按阈值过滤。
	const kbOffset = kbHeight > 400 ? kbHeight + 80 : 0;

	return (
		<Modal
			visible={visible}
			animationType="fade"
			transparent
			onRequestClose={close}
		>
			<Pressable style={styles.mask} onPress={close}>
				<Animated.View
					// 不用 SlideInDown：RN Modal（Dialog window）内 reanimated 的位移测量
					// 与屏幕高度不一致，动画终值会残留偏移（实测 sheet 悬空 ~193px）。
					// FadeIn 无位移不依赖测量；遮罩本身已有 fade。
					entering={FadeIn.duration(motion.enter)}
					style={[
						styles.sheet,
						{
							backgroundColor: colors.card,
							// 键盘弹出时上移避让（kbHeight 不含导航栏/手势条，额外补偿）；
							// 键盘收起时贴底，下方不留透明间隙
							marginBottom: kbOffset,
							// Modal 内 SafeArea 的 insets.bottom 可能残留键盘高度等异常大值，
							// clamp 到手势条范围内，避免 sheet 被撑高、顶部超出屏幕。
							paddingBottom: Math.min(insets.bottom, 48) + 12,
						},
					]}
				>
					<View style={styles.header}>
						<Text style={[styles.title, { color: colors.text }]}>
							{zh.tx.categoryAll}
						</Text>
						<Pressable onPress={close} hitSlop={8}>
							<Icon
								name="chevron-down"
								size={22}
								color={colors.textSecondary}
							/>
						</Pressable>
					</View>

					<View style={[styles.searchBox, { borderColor: colors.border }]}>
						<Icon name="search" size={16} color={colors.textSecondary} />
						<SingleLineTextInput
							style={[styles.searchInput, { color: colors.text }]}
							value={query}
							onChangeText={setQuery}
							placeholder={zh.tx.categorySearch}
							placeholderTextColor={colors.textSecondary}
						/>
						{showFlat && (
							<Pressable hitSlop={8} onPress={() => setQuery("")}>
								<Icon name="x" size={16} color={colors.textSecondary} />
							</Pressable>
						)}
					</View>

					<ScrollView
						style={{ maxHeight: gridMaxHeight }}
						contentContainerStyle={styles.chipWrap}
						keyboardShouldPersistTaps="handled"
					>
						{showFlat ? (
							<>
								{canCreate && (
									<Pressable
										style={[styles.chip, { borderColor: typeColor }]}
										onPress={handleCreate}
										disabled={createCat.isPending}
									>
										<Icon name="plus" size={14} color={typeColor} />
										<Text
											style={{ color: typeColor, fontSize: 13 }}
											numberOfLines={1}
										>
											{zh.tx.categoryCreate(q)}
										</Text>
									</Pressable>
								)}
								{filtered.length === 0 && !canCreate ? (
									<View style={styles.empty}>
										<Text style={{ color: colors.textSecondary }}>
											{zh.tx.categorySearchEmpty}
										</Text>
									</View>
								) : (
									filtered.map((r) => {
										const selected = r.id === selectedId;
										return (
											<Pressable
												key={r.id}
												style={[
													styles.chip,
													{ borderColor: selected ? typeColor : colors.border },
													selected && { backgroundColor: typeColor },
												]}
												onPress={() => handlePick(r.id)}
											>
												<Icon
													name={resolveIconKey(r.icon, "category")}
													size={14}
													color={selected ? colors.onPrimary : colors.text}
												/>
												<Text
													style={{
														color: selected ? colors.onPrimary : colors.text,
														fontSize: 13,
													}}
													numberOfLines={1}
												>
													{r.name}
												</Text>
											</Pressable>
										);
									})
								)}
							</>
						) : (
							tree.map(renderParentChip)
						)}
					</ScrollView>
				</Animated.View>

				{/* 键盘弹出时 sheet 上移，底部留出的区域用同色填充，避免透出下层（随后被软键盘覆盖） */}
				{kbOffset > 0 && (
					<View
						pointerEvents="none"
						style={{
							position: "absolute",
							bottom: 0,
							left: 0,
							right: 0,
							height: kbOffset,
							backgroundColor: colors.card,
						}}
					/>
				)}

				{/* 子分类菜单：点主分类胶囊的 chevron 弹出；backdrop 拦截外部点击仅关闭菜单 */}
				{submenu && (
					<Pressable
						style={StyleSheet.absoluteFill}
						onPress={() => setSubmenu(null)}
					>
						<Pressable
							style={[
								styles.submenuCard,
								{
									backgroundColor: colors.card,
									borderColor: colors.border,
									left: Math.min(submenu.x, screenW - 184),
									top: Math.min(
										submenu.y,
										screenH - submenu.parent.children.length * 40 - 48,
									),
								},
							]}
							onPress={(e) => e.stopPropagation()}
						>
							<Text
								style={[styles.submenuTitle, { color: colors.textSecondary }]}
							>
								{submenu.parent.name}
							</Text>
							{submenu.parent.children.map((child) => {
								const sel = child.id === selectedId;
								return (
									<Pressable
										key={child.id}
										style={[
											styles.submenuRow,
											sel && { backgroundColor: `${typeColor}18` },
										]}
										onPress={() => handlePick(child.id)}
									>
										<Icon
											name={resolveIconKey(child.icon, "category")}
											size={16}
											color={child.color ?? typeColor}
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
				)}
			</Pressable>
		</Modal>
	);
}

const styles = StyleSheet.create({
	mask: {
		flex: 1,
		backgroundColor: "rgba(0,0,0,0.4)",
		justifyContent: "flex-end",
	},
	sheet: { borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16 },
	header: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		marginBottom: 12,
	},
	title: { fontSize: 16, fontWeight: "600" },
	searchBox: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		borderWidth: 1,
		borderRadius: 10,
		paddingHorizontal: 12,
		paddingVertical: 8,
		marginBottom: 8,
	},
	searchInput: { flex: 1, height: 24, fontSize: 15 },
	chipWrap: {
		flexDirection: "row",
		flexWrap: "wrap",
		gap: 8,
		paddingVertical: 4,
	},
	chip: {
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
		paddingHorizontal: 12,
		paddingVertical: 7,
		borderRadius: 16,
		borderWidth: 1,
		maxWidth: "100%",
	},
	chipMoreBtn: { marginLeft: 2, padding: 2 },
	empty: { width: "100%", paddingVertical: 32, alignItems: "center" },
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
});
