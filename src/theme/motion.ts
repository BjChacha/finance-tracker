/**
 * 动效 tokens（毫秒）：全 App 过渡动画时长的唯一出处，禁止散落硬编码。
 * 缓动约定：进入用 Easing.out、退出/盖幕用 Easing.in（在使用处引入 reanimated 的 Easing）。
 * reanimated 4 的 withTiming / entering / exiting 默认 reduceMotion=System：
 * 系统开启「减弱动态效果」时动画跳至终态且回调照常触发，全部过渡自动退化为瞬切。
 */
export const motion = {
	/** 遮罩/scrim 淡入淡出；fade-through 的盖幕段；页签同侧替换的交叉淡化 */
	fast: 120,
	/** 页签切换滑动：点击固定一屏、260ms（手势释放按剩余距离缩放到 90–260ms） */
	tab: 260,
	/** 常规内容过渡：表单区块微滑淡入、fade-through 揭幕段 */
	base: 180,
	/** 底部面板（sheet/键盘）滑入 */
	enter: 220,
	/** 底部面板滑出（退出比进入快） */
	exit: 150,
	/** 一级之上的卡片/记账键盘从底部进入 */
	sheetEnter: 260,
	/** 卡片/记账键盘向底部退出 */
	sheetExit: 240,
	/** 统一的「先快后慢」三次贝塞尔曲线控制点 */
	sheetCurve: [0.22, 1, 0.36, 1] as const,
} as const;
